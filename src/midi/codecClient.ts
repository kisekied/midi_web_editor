import type { DecodeResult, MidiDocument } from '../domain/types'

interface WorkerResponse<T> {
  id: number
  ok: boolean
  result?: T
  error?: string
}

interface PendingRequest<T> {
  resolve: (result: T) => void
  reject: (error: Error) => void
}

export class MidiCodecClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, PendingRequest<unknown>>()
  private nextId = 1

  constructor() {
    this.worker = new Worker(new URL('./codec.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (message: MessageEvent<WorkerResponse<unknown>>) => {
      const response = message.data
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.ok && response.result !== undefined) pending.resolve(response.result)
      else pending.reject(new Error(response.error ?? 'MIDI 处理失败'))
    }
    this.worker.onerror = (event) => {
      for (const request of this.pending.values()) request.reject(new Error(event.message))
      this.pending.clear()
    }
  }

  decode(bytes: ArrayBuffer, fileName: string): Promise<DecodeResult> {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      })
      this.worker.postMessage({ id, type: 'decode', bytes, fileName }, [bytes])
    })
  }

  encode(document: MidiDocument): Promise<Uint8Array> {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      })
      this.worker.postMessage({ id, type: 'encode', document })
    })
  }

  dispose(): void {
    this.worker.terminate()
    for (const request of this.pending.values()) {
      request.reject(new Error('MIDI worker 已关闭'))
    }
    this.pending.clear()
  }
}
