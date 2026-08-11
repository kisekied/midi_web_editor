import { describe, expect, it } from 'vitest'
import { createBlankDocument, createMusicTrack } from '../domain/defaultDocument'
import type { MidiNote } from '../domain/types'
import { encodeMusicXml } from './encodeMusicXml'

function note(id: string, startTick: number, durationTicks: number, pitch: number): MidiNote {
  return {
    id,
    startTick,
    durationTicks,
    pitch,
    velocity: 96,
    releaseVelocity: 0,
    channel: 0,
    sourceOnOrder: 0,
    sourceOffOrder: 1,
    importedOverlap: false,
  }
}

describe('MusicXML export', () => {
  it('exports metadata, parts, tempo, time signature and MIDI pitch spelling', () => {
    const document = createBlankDocument('Rock & Roll <Demo>')
    const track = document.tracks.find((candidate) => candidate.kind === 'music')
    if (!track) throw new Error('missing music track')
    track.name = 'Lead & Piano'
    track.defaultChannel = 2
    track.defaultProgram = 4
    track.notes = [note('c-sharp', 0, 480, 61)]

    const xml = encodeMusicXml(document)

    expect(xml).toContain('<score-partwise version="4.0">')
    expect(xml).toContain('<work-title>Rock &amp; Roll &lt;Demo&gt;</work-title>')
    expect(xml).toContain('<part-name>Lead &amp; Piano</part-name>')
    expect(xml).toContain('<divisions>480</divisions>')
    expect(xml).toContain('<beats>4</beats>')
    expect(xml).toContain('<beat-type>4</beat-type>')
    expect(xml).toContain('<per-minute>120</per-minute>')
    expect(xml).toContain('<midi-channel>3</midi-channel>')
    expect(xml).toContain('<midi-program>5</midi-program>')
    expect(xml).toContain('<note dynamics="106.667" end-dynamics="0">')
    expect(xml).toMatch(/<step>C<\/step>\s+<alter>1<\/alter>\s+<octave>4<\/octave>/)
  })

  it('writes simultaneous notes as a chord and overlapping notes in separate voices', () => {
    const document = createBlankDocument()
    const track = document.tracks.find((candidate) => candidate.kind === 'music')
    if (!track) throw new Error('missing music track')
    track.notes = [note('c', 0, 960, 60), note('e', 0, 960, 64), note('g', 480, 960, 67)]

    const xml = encodeMusicXml(document)

    expect(xml.match(/<chord\/>/g)).toHaveLength(1)
    expect(xml).toContain('<voice>1</voice>')
    expect(xml).toContain('<voice>2</voice>')
    expect(xml).toContain('<backup>')
  })

  it('splits notes crossing a barline and joins them with ties', () => {
    const document = createBlankDocument()
    const track = document.tracks.find((candidate) => candidate.kind === 'music')
    if (!track) throw new Error('missing music track')
    track.notes = [note('long', 1440, 960, 60)]

    const xml = encodeMusicXml(document)

    expect(xml.match(/<measure number=/g)).toHaveLength(2)
    expect(xml).toContain('<tie type="start"/>')
    expect(xml).toContain('<tie type="stop"/>')
    expect(xml).toContain('<tied type="start"/>')
    expect(xml).toContain('<tied type="stop"/>')
  })

  it('exports each music track as a separate score part', () => {
    const document = createBlankDocument()
    const secondTrack = createMusicTrack(2, 'Strings')
    secondTrack.notes = [note('strings', 0, 480, 72)]
    document.tracks.push(secondTrack)

    const xml = encodeMusicXml(document)

    expect(xml.match(/<score-part id=/g)).toHaveLength(2)
    expect(xml.match(/<part id=/g)).toHaveLength(2)
    expect(xml).toContain('<part-name>Strings</part-name>')
  })
})
