import type { MidiOutputDevice } from '../domain/types'

type DeviceListener = (devices: MidiOutputDevice[]) => void

class WebMidiManager {
  private access: MIDIAccess | null = null
  private readonly listeners = new Set<DeviceListener>()

  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  }

  get connected(): boolean {
    return this.access !== null
  }

  async connect(): Promise<MidiOutputDevice[]> {
    if (!this.supported) throw new Error('当前浏览器不支持 Web MIDI')
    this.access = await navigator.requestMIDIAccess({ sysex: false })
    this.access.onstatechange = () => this.emit()
    this.emit()
    return this.devices()
  }

  devices(): MidiOutputDevice[] {
    const devices: MidiOutputDevice[] = []
    this.access?.outputs.forEach((port) => {
      devices.push({
        id: port.id,
        name: port.name || '未命名 MIDI 端口',
        manufacturer: port.manufacturer || '',
        state: port.state,
      })
    })
    return devices.sort((left, right) => left.name.localeCompare(right.name))
  }

  subscribe(listener: DeviceListener): () => void {
    this.listeners.add(listener)
    listener(this.devices())
    return () => this.listeners.delete(listener)
  }

  send(portId: string, data: number[] | Uint8Array, timestamp?: number): boolean {
    const output = this.access?.outputs.get(portId)
    if (!output || output.state !== 'connected') return false
    output.send(data, timestamp)
    return true
  }

  panic(portId: string): void {
    const output = this.access?.outputs.get(portId)
    if (!output) return
    ;(output as MIDIOutput & { clear?: () => void }).clear?.()
    for (let channel = 0; channel < 16; channel += 1) {
      output.send([0xb0 | channel, 120, 0])
      output.send([0xb0 | channel, 123, 0])
      output.send([0xe0 | channel, 0, 64])
    }
  }

  panicAll(): void {
    this.access?.outputs.forEach((output) => {
      this.panic(output.id)
    })
  }

  private emit(): void {
    const devices = this.devices()
    for (const listener of this.listeners) listener(devices)
  }
}

export const webMidiManager = new WebMidiManager()
