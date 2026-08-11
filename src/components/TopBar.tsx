import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { MidiOutputDevice } from '../domain/types'
import { editorStore } from '../state/editorStore'
import type { Theme } from '../theme'
import { Icon } from './Icon'
import { Divider, ToolButton } from './Ui'

interface TopBarProps {
  canPaste: boolean
  devices: MidiOutputDevice[]
  midiConnected: boolean
  midiSupported: boolean
  onConnectMidi: () => void
  onCopy: () => void
  onExport: () => void
  onExportMusicXml: () => void
  onImport: () => void
  onNew: () => void
  onPaste: () => void
  onToggleTheme: () => void
  theme: Theme
}

export function TopBar({
  canPaste,
  devices,
  midiConnected,
  midiSupported,
  onConnectMidi,
  onCopy,
  onExport,
  onExportMusicXml,
  onImport,
  onNew,
  onPaste,
  onToggleTheme,
  theme,
}: TopBarProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const document = useStore(editorStore, (state) => state.document)
  const dirty = useStore(editorStore, (state) => state.dirty)
  const selectedNoteIds = useStore(editorStore, (state) => state.selectedNoteIds)
  const undoStack = useStore(editorStore, (state) => state.undoStack)
  const redoStack = useStore(editorStore, (state) => state.redoStack)
  const execute = useStore(editorStore, (state) => state.execute)
  const undo = useStore(editorStore, (state) => state.undo)
  const redo = useStore(editorStore, (state) => state.redo)

  useEffect(() => {
    if (!exportMenuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setExportMenuOpen(false)
      exportButtonRef.current?.focus()
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [exportMenuOpen])

  if (!document) return null

  return (
    <header className="top-bar">
      <div className="brand-mark" aria-label="织音 MIDI 编辑器" role="img">
        <span className="brand-glyph">
          <Icon className="size-5" name="midi" />
        </span>
        <div>
          <strong>织音</strong>
          <span>ZHIYIN MIDI</span>
        </div>
      </div>

      <Divider />

      <div className="document-name-wrap">
        <span aria-hidden="true" className={`dirty-dot ${dirty ? 'is-dirty' : ''}`} />
        <input
          aria-label="作品名称"
          className="document-name"
          key={`${document.id}:${document.name}`}
          defaultValue={document.name}
          onBlur={(event) => execute({ type: 'rename-document', name: event.currentTarget.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span className="format-chip">SMF {document.format}</span>
      </div>

      <nav className="top-actions" aria-label="文件与编辑操作">
        <ToolButton icon="file" label="新建 MIDI" onClick={onNew}>
          <span>新建</span>
        </ToolButton>
        <ToolButton icon="download" label="导入 MIDI" onClick={onImport}>
          <span>导入</span>
        </ToolButton>
        <div className="export-menu" ref={exportMenuRef}>
          <ToolButton
            aria-expanded={exportMenuOpen}
            aria-haspopup="menu"
            className="export-menu-trigger"
            icon="upload"
            label="导出文件"
            onClick={() => setExportMenuOpen((open) => !open)}
            ref={exportButtonRef}
          >
            <span>导出</span>
            <Icon className="export-chevron" name="chevron-down" />
          </ToolButton>
          {exportMenuOpen ? (
            <div aria-label="导出格式" className="export-menu-popover" role="menu">
              <button
                onClick={() => {
                  setExportMenuOpen(false)
                  onExport()
                }}
                role="menuitem"
                type="button"
              >
                <strong>MIDI</strong>
                <span>Standard MIDI File · ⌘/Ctrl+S</span>
              </button>
              <button
                onClick={() => {
                  setExportMenuOpen(false)
                  onExportMusicXml()
                }}
                role="menuitem"
                type="button"
              >
                <strong>MusicXML</strong>
                <span>乐谱交换格式 · .musicxml</span>
              </button>
            </div>
          ) : null}
        </div>
        <Divider />
        <ToolButton
          disabled={!undoStack.length}
          icon="undo"
          label="撤销（⌘/Ctrl+Z）"
          onClick={undo}
        />
        <ToolButton
          disabled={!redoStack.length}
          icon="redo"
          label="重做（⌘/Ctrl+Shift+Z）"
          onClick={redo}
        />
        <Divider />
        <ToolButton
          disabled={!selectedNoteIds.length}
          icon="copy"
          label="复制所选音符（⌘/Ctrl+C）"
          onClick={onCopy}
        />
        <ToolButton
          disabled={!canPaste}
          icon="paste"
          label="紧跟上次编辑位置粘贴音符（⌘/Ctrl+V）"
          onClick={onPaste}
        />
        <Divider />
        <button
          className={`midi-status-button ${midiConnected ? 'is-connected' : ''}`}
          disabled={!midiSupported}
          onClick={onConnectMidi}
          title={midiSupported ? '连接或刷新 MIDI 输出设备' : '当前浏览器不支持 Web MIDI'}
          type="button"
        >
          <Icon className="size-4" name="midi" />
          <span>
            {midiConnected
              ? `${devices.filter((device) => device.state === 'connected').length} 个设备`
              : '连接 MIDI'}
          </span>
          <i aria-hidden="true" />
        </button>
        <ToolButton
          icon={theme === 'dark' ? 'sun' : 'moon'}
          label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          onClick={onToggleTheme}
        />
      </nav>
    </header>
  )
}
