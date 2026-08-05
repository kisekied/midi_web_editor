import * as Tone from 'tone'
import { secondsToTicks, ticksToSeconds } from '../domain/time'
import type { MidiDocument, MidiNote, RawMidiEvent } from '../domain/types'
import { editorStore } from '../state/editorStore'
import { eventToMidiMessage } from './midiMessages'
import { webMidiManager } from './webMidi'

interface TimelineEvent {
  id: string
  trackId: string
  tick: number
  seconds: number
  kind: 'note-on' | 'note-off' | 'channel'
  channel: number
  note?: number
  velocity?: number
  message: number[]
}

interface TrackSynths {
  melodic: Tone.PolySynth
  drum: Tone.MembraneSynth
}

export interface PlaybackSnapshot {
  playing: boolean
  starting: boolean
  error: string | null
}

type PlaybackListener = (snapshot: PlaybackSnapshot) => void

function numeric(event: RawMidiEvent, key: string, fallback = 0): number {
  const value = event[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function buildTimeline(document: MidiDocument): TimelineEvent[] {
  const timeline: TimelineEvent[] = []
  for (const track of document.tracks) {
    for (const note of track.notes) {
      timeline.push({
        id: `${note.id}:on`,
        trackId: track.id,
        tick: note.startTick,
        seconds: ticksToSeconds(document, note.startTick),
        kind: 'note-on',
        channel: note.channel,
        note: note.pitch,
        velocity: note.velocity,
        message: [0x90 | note.channel, note.pitch, note.velocity],
      })
      timeline.push({
        id: `${note.id}:off`,
        trackId: track.id,
        tick: note.startTick + note.durationTicks,
        seconds: ticksToSeconds(document, note.startTick + note.durationTicks),
        kind: 'note-off',
        channel: note.channel,
        note: note.pitch,
        velocity: note.releaseVelocity,
        message: [0x80 | note.channel, note.pitch, note.releaseVelocity],
      })
    }
    for (const passthrough of track.passthroughEvents) {
      const message = eventToMidiMessage(passthrough.event)
      if (!message) continue
      timeline.push({
        id: passthrough.id,
        trackId: track.id,
        tick: passthrough.absoluteTick,
        seconds: ticksToSeconds(document, passthrough.absoluteTick),
        kind: 'channel',
        channel: numeric(passthrough.event, 'channel'),
        message,
      })
    }
    if (track.kind === 'music') {
      timeline.push({
        id: `${track.id}:default-program`,
        trackId: track.id,
        tick: 0,
        seconds: 0,
        kind: 'channel',
        channel: track.defaultChannel,
        message: [0xc0 | track.defaultChannel, track.defaultProgram],
      })
    }
  }
  return timeline.sort((left, right) => {
    if (left.tick !== right.tick) return left.tick - right.tick
    const priority = (event: TimelineEvent) =>
      event.kind === 'note-off' ? 1 : event.kind === 'note-on' ? 2 : 0
    return priority(left) - priority(right)
  })
}

function lowerBound(timeline: TimelineEvent[], tick: number): number {
  let low = 0
  let high = timeline.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const event = timeline[middle]
    if (event && event.tick < tick) low = middle + 1
    else high = middle
  }
  return low
}

class PlaybackEngine {
  private timeline: TimelineEvent[] = []
  private cursor = 0
  private originAudioTime = 0
  private originDocumentSeconds = 0
  private timer: number | undefined
  private snapshot: PlaybackSnapshot = { playing: false, starting: false, error: null }
  private readonly listeners = new Set<PlaybackListener>()
  private readonly synths = new Map<string, TrackSynths>()

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  get state(): PlaybackSnapshot {
    return this.snapshot
  }

  async play(): Promise<void> {
    const state = editorStore.getState()
    const document = state.document
    if (!document || this.snapshot.playing || this.snapshot.starting) return
    this.updateSnapshot({ starting: true, error: null })
    try {
      await Tone.start()
      this.timeline = buildTimeline(document)
      const startTick = this.normalizedStartTick(state.playheadTick)
      this.cursor = lowerBound(this.timeline, startTick)
      this.originAudioTime = Tone.now() + 0.04
      this.originDocumentSeconds = ticksToSeconds(document, startTick)
      this.chaseState(document, startTick)
      this.updateSnapshot({ playing: true, starting: false, error: null })
      this.schedule()
      this.timer = window.setInterval(() => this.schedule(), 25)
    } catch (error) {
      this.updateSnapshot({
        playing: false,
        starting: false,
        error: error instanceof Error ? error.message : '无法启动音频',
      })
    }
  }

  pause(): void {
    if (!this.snapshot.playing && !this.snapshot.starting) return
    const state = editorStore.getState()
    const document = state.document
    if (document && this.snapshot.playing) {
      const documentSeconds =
        this.originDocumentSeconds + Math.max(0, Tone.now() - this.originAudioTime)
      state.setPlayhead(secondsToTicks(document, documentSeconds))
    }
    this.haltVoices()
    this.updateSnapshot({ playing: false, starting: false })
  }

  stop(): void {
    this.haltVoices()
    editorStore.getState().setPlayhead(0)
    this.updateSnapshot({ playing: false, starting: false, error: null })
  }

  seek(tick: number): void {
    const wasPlaying = this.snapshot.playing
    if (wasPlaying) this.pause()
    editorStore.getState().setPlayhead(tick)
    if (wasPlaying) void this.play()
  }

  dispose(): void {
    this.haltVoices()
    for (const synth of this.synths.values()) {
      synth.melodic.dispose()
      synth.drum.dispose()
    }
    this.synths.clear()
    this.listeners.clear()
  }

  private schedule(): void {
    const state = editorStore.getState()
    const document = state.document
    if (!document || !this.snapshot.playing) return
    const now = Tone.now()
    const currentDocumentSeconds =
      this.originDocumentSeconds + Math.max(0, now - this.originAudioTime)
    let currentTick = secondsToTicks(document, currentDocumentSeconds)

    if (state.loop.enabled && currentTick >= state.loop.endTick) {
      this.haltVoices(false)
      currentTick = state.loop.startTick
      this.cursor = lowerBound(this.timeline, currentTick)
      this.originAudioTime = Tone.now() + 0.02
      this.originDocumentSeconds = ticksToSeconds(document, currentTick)
      this.chaseState(document, currentTick)
    }

    state.setPlayhead(currentTick)
    const horizonSeconds =
      this.originDocumentSeconds + Math.max(0, Tone.now() + 0.1 - this.originAudioTime)
    while (this.cursor < this.timeline.length) {
      const event = this.timeline[this.cursor]
      if (!event || event.seconds > horizonSeconds) break
      if (state.loop.enabled && event.tick >= state.loop.endTick) break
      const delaySeconds = Math.max(0, event.seconds - currentDocumentSeconds)
      this.routeEvent(event, Tone.now() + delaySeconds, performance.now() + delaySeconds * 1000)
      this.cursor += 1
    }

    if (!state.loop.enabled && this.cursor >= this.timeline.length) {
      const lastEvent = this.timeline.at(-1)
      if (!lastEvent || currentTick > lastEvent.tick + document.ppq) this.stop()
    }
  }

  private routeEvent(event: TimelineEvent, audioTime: number, performanceTime: number): void {
    const state = editorStore.getState()
    const hasSolo = state.soloTrackIds.length > 0
    if (state.mutedTrackIds.includes(event.trackId)) return
    if (hasSolo && !state.soloTrackIds.includes(event.trackId)) return
    const route = state.routes[event.trackId] ?? { kind: 'internal' as const }

    if (route.kind === 'midi') {
      webMidiManager.send(route.portId, event.message, performanceTime)
      return
    }
    if (event.kind === 'channel' || event.note === undefined) return
    const synth = this.synthFor(event.trackId)
    const velocity = Math.max(0, Math.min(1, (event.velocity ?? 0) / 127))
    if (event.channel === 9) {
      if (event.kind === 'note-on') {
        synth.drum.triggerAttackRelease(
          Tone.Frequency(event.note, 'midi').toFrequency(),
          '16n',
          audioTime,
          velocity,
        )
      }
      return
    }
    const frequency = Tone.Frequency(event.note, 'midi').toFrequency()
    if (event.kind === 'note-on') synth.melodic.triggerAttack(frequency, audioTime, velocity)
    else synth.melodic.triggerRelease(frequency, audioTime)
  }

  private chaseState(document: MidiDocument, startTick: number): void {
    const state = editorStore.getState()
    const latestMessages = new Map<string, TimelineEvent>()
    for (const event of this.timeline) {
      if (event.tick >= startTick) break
      if (event.kind !== 'channel') continue
      const status = event.message[0] ?? 0
      const controller = (status & 0xf0) === 0xb0 ? (event.message[1] ?? 0) : 0
      latestMessages.set(`${event.trackId}:${status}:${controller}`, event)
    }
    for (const event of latestMessages.values()) {
      const route = state.routes[event.trackId]
      if (route?.kind === 'midi') webMidiManager.send(route.portId, event.message)
    }

    for (const track of document.tracks) {
      const route = state.routes[track.id] ?? { kind: 'internal' as const }
      for (const note of track.notes) {
        if (note.startTick >= startTick || note.startTick + note.durationTicks <= startTick)
          continue
        const event: TimelineEvent = {
          id: `${note.id}:chase`,
          trackId: track.id,
          tick: startTick,
          seconds: ticksToSeconds(document, startTick),
          kind: 'note-on',
          channel: note.channel,
          note: note.pitch,
          velocity: note.velocity,
          message: [0x90 | note.channel, note.pitch, note.velocity],
        }
        if (route.kind === 'midi') webMidiManager.send(route.portId, event.message)
        else this.routeEvent(event, Tone.now() + 0.01, performance.now() + 10)
      }
    }
  }

  private synthFor(trackId: string): TrackSynths {
    const existing = this.synths.get(trackId)
    if (existing) return existing
    const melodic = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.006, decay: 0.15, sustain: 0.35, release: 0.4 },
    }).toDestination()
    melodic.maxPolyphony = 48
    melodic.volume.value = -10
    const drum = new Tone.MembraneSynth({
      pitchDecay: 0.025,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.08 },
      volume: -8,
    }).toDestination()
    const synths = { melodic, drum }
    this.synths.set(trackId, synths)
    return synths
  }

  private normalizedStartTick(tick: number): number {
    const loop = editorStore.getState().loop
    if (loop.enabled && (tick < loop.startTick || tick >= loop.endTick)) return loop.startTick
    return Math.max(0, Math.round(tick))
  }

  private haltVoices(clearTimer = true): void {
    if (clearTimer) {
      window.clearInterval(this.timer)
      this.timer = undefined
    }
    for (const synth of this.synths.values()) {
      synth.melodic.releaseAll(Tone.now())
      synth.drum.triggerRelease(Tone.now())
    }
    webMidiManager.panicAll()
  }

  private updateSnapshot(changes: Partial<PlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes }
    for (const listener of this.listeners) listener(this.snapshot)
  }
}

export const playbackEngine = new PlaybackEngine()

export function installPlaybackEditGuard(): () => void {
  return editorStore.subscribe((state, previous) => {
    if (
      playbackEngine.state.playing &&
      (state.document !== previous.document ||
        state.routes !== previous.routes ||
        state.mutedTrackIds !== previous.mutedTrackIds ||
        state.soloTrackIds !== previous.soloTrackIds)
    ) {
      playbackEngine.pause()
    }
  })
}

export function noteIsActiveAt(note: MidiNote, tick: number): boolean {
  return note.startTick < tick && note.startTick + note.durationTicks > tick
}
