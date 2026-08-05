import type { DecodeWarning } from '../domain/types'
import { Icon } from './Icon'

export function UnsavedDialog({
  onCancel,
  onDiscard,
  onExport,
}: {
  onCancel: () => void
  onDiscard: () => void
  onExport: () => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="unsaved-title"
        aria-modal="true"
        className="dialog-card"
        role="dialog"
      >
        <span className="dialog-icon warning">
          <Icon className="size-5" name="warning" />
        </span>
        <div>
          <p className="dialog-eyebrow">UNEXPORTED CHANGES</p>
          <h2 id="unsaved-title">还有尚未导出的修改</h2>
          <p>本地快照会自动恢复，但当前操作将替换它。可以先下载 MIDI，再继续。</p>
        </div>
        <div className="dialog-actions">
          <button className="dialog-button ghost" onClick={onCancel} type="button">
            取消
          </button>
          <button className="dialog-button danger" onClick={onDiscard} type="button">
            放弃修改
          </button>
          <button className="dialog-button primary" onClick={onExport} type="button">
            <Icon className="size-4" name="download" />
            先导出再继续
          </button>
        </div>
      </section>
    </div>
  )
}

export function WarningDialog({
  warnings,
  onClose,
}: {
  warnings: DecodeWarning[]
  onClose: () => void
}) {
  if (!warnings.length) return null
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="warning-title"
        aria-modal="true"
        className="dialog-card warning-dialog"
        role="dialog"
      >
        <span className="dialog-icon warning">
          <Icon className="size-5" name="warning" />
        </span>
        <div>
          <p className="dialog-eyebrow">IMPORT REPORT</p>
          <h2 id="warning-title">文件已导入，但有几点需要注意</h2>
          <p>这些原始事件仍会保留在导出文件中；警告涉及的音符可能无法在钢琴卷帘中安全编辑。</p>
        </div>
        <ul className="warning-list">
          {warnings.map((warning) => (
            <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button className="dialog-button primary" onClick={onClose} type="button">
            我知道了
          </button>
        </div>
      </section>
    </div>
  )
}
