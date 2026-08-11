import { microsecondsToBpm, signatureAtTick, ticksPerMeasure } from '../domain/time'
import type { MidiDocument, MidiNote, MidiTrack, TimeSignatureEvent } from '../domain/types'

interface MeasureSpan {
  startTick: number
  endTick: number
  signature: TimeSignatureEvent
  signatureChanged: boolean
  implicit: boolean
}

interface NoteGroup {
  startTick: number
  endTick: number
  notes: MidiNote[]
}

const PITCHES = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
] as const

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function musicTracks(document: MidiDocument): MidiTrack[] {
  return document.tracks.filter((track) => track.kind === 'music')
}

function scoreEndTick(document: MidiDocument): number {
  let endTick = 1
  for (const track of musicTracks(document)) {
    for (const note of track.notes) endTick = Math.max(endTick, note.startTick + note.durationTicks)
  }
  for (const event of document.tempoEvents) endTick = Math.max(endTick, event.tick + 1)
  for (const event of document.timeSignatureEvents) endTick = Math.max(endTick, event.tick + 1)
  return endTick
}

function measureSpans(document: MidiDocument): MeasureSpan[] {
  const endTick = scoreEndTick(document)
  const changes = [...document.timeSignatureEvents]
    .filter((event) => event.tick > 0)
    .sort((left, right) => left.tick - right.tick || left.sourceOrder - right.sourceOrder)
  const spans: MeasureSpan[] = []
  let startTick = 0
  let signature = signatureAtTick(document, 0)
  let changeIndex = 0
  let signatureChanged = true

  while (startTick < endTick) {
    let changeAtStart = changes[changeIndex]
    while (changeAtStart?.tick === startTick) {
      signature = changeAtStart
      changeIndex += 1
      signatureChanged = true
      changeAtStart = changes[changeIndex]
    }
    const naturalEnd = startTick + ticksPerMeasure(document, signature)
    const nextChange = changes[changeIndex]
    const endTickForMeasure =
      nextChange !== undefined && nextChange.tick < naturalEnd ? nextChange.tick : naturalEnd
    spans.push({
      startTick,
      endTick: endTickForMeasure,
      signature,
      signatureChanged,
      implicit: endTickForMeasure - startTick !== ticksPerMeasure(document, signature),
    })
    signatureChanged = false
    startTick = endTickForMeasure
  }

  return spans
}

function assignVoices(notes: MidiNote[]): NoteGroup[][] {
  const grouped = new Map<string, NoteGroup>()
  for (const note of notes) {
    const startTick = Math.max(0, Math.round(note.startTick))
    const endTick = startTick + Math.max(1, Math.round(note.durationTicks))
    const key = `${startTick}:${endTick}`
    const group = grouped.get(key)
    if (group) group.notes.push(note)
    else grouped.set(key, { startTick, endTick, notes: [note] })
  }
  const groups = [...grouped.values()].sort(
    (left, right) => left.startTick - right.startTick || left.endTick - right.endTick,
  )
  const voices: NoteGroup[][] = []
  const voiceEnds: number[] = []
  for (const group of groups) {
    let voiceIndex = voiceEnds.findIndex((endTick) => endTick <= group.startTick)
    if (voiceIndex < 0) {
      voiceIndex = voices.length
      voices.push([])
      voiceEnds.push(0)
    }
    const voice = voices[voiceIndex]
    if (!voice) throw new Error('无法为 MusicXML 音符分配声部')
    voice.push(group)
    voiceEnds[voiceIndex] = group.endTick
  }
  return voices
}

function pitchXml(pitch: number): string[] {
  const safePitch = Math.min(127, Math.max(0, Math.round(pitch)))
  const spelling = PITCHES[safePitch % 12] ?? PITCHES[0]
  return [
    '          <pitch>',
    `            <step>${spelling.step}</step>`,
    ...(spelling.alter ? [`            <alter>${spelling.alter}</alter>`] : []),
    `            <octave>${Math.floor(safePitch / 12) - 1}</octave>`,
    '          </pitch>',
  ]
}

function velocityPercentage(velocity: number): number {
  return Math.round((Math.min(127, Math.max(0, Math.round(velocity))) * 100 * 1000) / 90) / 1000
}

function noteXml(
  note: MidiNote,
  duration: number,
  voice: number,
  chord: boolean,
  tieStop: boolean,
  tieStart: boolean,
): string[] {
  const ties = [
    ...(tieStop ? ['          <tie type="stop"/>'] : []),
    ...(tieStart ? ['          <tie type="start"/>'] : []),
  ]
  const tiedNotations = [
    ...(tieStop ? ['            <tied type="stop"/>'] : []),
    ...(tieStart ? ['            <tied type="start"/>'] : []),
  ]
  return [
    `        <note dynamics="${velocityPercentage(note.velocity)}" end-dynamics="${velocityPercentage(note.releaseVelocity)}">`,
    ...(chord ? ['          <chord/>'] : []),
    ...pitchXml(note.pitch),
    `          <duration>${duration}</duration>`,
    ...ties,
    `          <voice>${voice}</voice>`,
    ...(tiedNotations.length
      ? ['          <notations>', ...tiedNotations, '          </notations>']
      : []),
    '        </note>',
  ]
}

function tempoDirections(document: MidiDocument, span: MeasureSpan): string[] {
  return [...document.tempoEvents]
    .filter((event) => event.tick >= span.startTick && event.tick < span.endTick)
    .sort((left, right) => left.tick - right.tick || left.sourceOrder - right.sourceOrder)
    .flatMap((event) => {
      const bpm = Math.round(microsecondsToBpm(event.microsecondsPerBeat) * 1000) / 1000
      return [
        '        <direction placement="above">',
        '          <direction-type>',
        '            <metronome>',
        '              <beat-unit>quarter</beat-unit>',
        `              <per-minute>${bpm}</per-minute>`,
        '            </metronome>',
        '          </direction-type>',
        ...(event.tick > span.startTick
          ? [`          <offset>${event.tick - span.startTick}</offset>`]
          : []),
        `          <sound tempo="${bpm}"/>`,
        '        </direction>',
      ]
    })
}

function measureXml(
  document: MidiDocument,
  span: MeasureSpan,
  measureIndex: number,
  voices: NoteGroup[][],
  includeTempo: boolean,
): string[] {
  const duration = span.endTick - span.startTick
  const lines = [
    `      <measure number="${measureIndex + 1}"${span.implicit ? ' implicit="yes"' : ''}>`,
  ]
  if (measureIndex === 0 || span.signatureChanged) {
    lines.push(
      '        <attributes>',
      ...(measureIndex === 0 ? [`          <divisions>${document.ppq}</divisions>`] : []),
      '          <time>',
      `            <beats>${span.signature.numerator}</beats>`,
      `            <beat-type>${span.signature.denominator}</beat-type>`,
      '          </time>',
      ...(measureIndex === 0
        ? [
            '          <clef>',
            '            <sign>G</sign>',
            '            <line>2</line>',
            '          </clef>',
          ]
        : []),
      '        </attributes>',
    )
  }
  if (includeTempo) lines.push(...tempoDirections(document, span))

  const activeVoices = voices
    .map((groups, index) => ({ groups, number: index + 1 }))
    .filter(({ groups }) =>
      groups.some((group) => group.startTick < span.endTick && group.endTick > span.startTick),
    )
  if (!activeVoices.length) {
    lines.push(
      '        <forward>',
      `          <duration>${duration}</duration>`,
      '          <voice>1</voice>',
      '        </forward>',
    )
  }

  activeVoices.forEach(({ groups, number }, voiceIndex) => {
    if (voiceIndex > 0) {
      lines.push(
        '        <backup>',
        `          <duration>${duration}</duration>`,
        '        </backup>',
      )
    }
    let cursor = span.startTick
    for (const group of groups) {
      if (group.startTick >= span.endTick || group.endTick <= span.startTick) continue
      const fragmentStart = Math.max(group.startTick, span.startTick)
      const fragmentEnd = Math.min(group.endTick, span.endTick)
      if (fragmentStart > cursor) {
        lines.push(
          '        <forward>',
          `          <duration>${fragmentStart - cursor}</duration>`,
          `          <voice>${number}</voice>`,
          '        </forward>',
        )
      }
      group.notes
        .sort((left, right) => left.pitch - right.pitch)
        .forEach((note, noteIndex) => {
          lines.push(
            ...noteXml(
              note,
              fragmentEnd - fragmentStart,
              number,
              noteIndex > 0,
              group.startTick < span.startTick,
              group.endTick > span.endTick,
            ),
          )
        })
      cursor = fragmentEnd
    }
    if (cursor < span.endTick) {
      lines.push(
        '        <forward>',
        `          <duration>${span.endTick - cursor}</duration>`,
        `          <voice>${number}</voice>`,
        '        </forward>',
      )
    }
  })
  lines.push('      </measure>')
  return lines
}

export function encodeMusicXml(document: MidiDocument): string {
  if (!Number.isInteger(document.ppq) || document.ppq <= 0) {
    throw new Error('无法导出 MusicXML：PPQ 必须是正整数')
  }
  const tracks = musicTracks(document)
  if (!tracks.length) throw new Error('没有可导出的音乐轨道')
  const spans = measureSpans(document)
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    '  <work>',
    `    <work-title>${escapeXml(document.name)}</work-title>`,
    '  </work>',
    '  <identification>',
    '    <encoding>',
    '      <software>织音 ZHIYIN MIDI</software>',
    '    </encoding>',
    '  </identification>',
    '  <part-list>',
  ]
  tracks.forEach((track, index) => {
    const partId = `P${index + 1}`
    lines.push(
      `    <score-part id="${partId}">`,
      `      <part-name>${escapeXml(track.name)}</part-name>`,
      `      <score-instrument id="${partId}-I1">`,
      `        <instrument-name>${escapeXml(track.name)}</instrument-name>`,
      '      </score-instrument>',
      `      <midi-instrument id="${partId}-I1">`,
      `        <midi-channel>${track.defaultChannel + 1}</midi-channel>`,
      `        <midi-program>${track.defaultProgram + 1}</midi-program>`,
      '      </midi-instrument>',
      '    </score-part>',
    )
  })
  lines.push('  </part-list>')
  tracks.forEach((track, trackIndex) => {
    const voices = assignVoices(track.notes)
    lines.push(`  <part id="P${trackIndex + 1}">`)
    spans.forEach((span, measureIndex) => {
      lines.push(...measureXml(document, span, measureIndex, voices, trackIndex === 0))
    })
    lines.push('  </part>')
  })
  lines.push('</score-partwise>', '')
  return lines.join('\n')
}
