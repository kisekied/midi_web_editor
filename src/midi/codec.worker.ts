import type { MidiDocument } from '../domain/types'
import { decodeMidi, encodeMidi } from './codecCore'

type WorkerRequest =
  | { id: number; type: 'decode'; bytes: ArrayBuffer; fileName: string }
  | { id: number; type: 'encode'; document: MidiDocument }

self.onmessage = (message: MessageEvent<WorkerRequest>) => {
  const request = message.data
  try {
    if (request.type === 'decode') {
      const result = decodeMidi(request.bytes, request.fileName)
      self.postMessage({ id: request.id, ok: true, result })
      return
    }
    const bytes = encodeMidi(request.document)
    self.postMessage({ id: request.id, ok: true, result: bytes }, [bytes.buffer])
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'MIDI 处理失败',
    })
  }
}
