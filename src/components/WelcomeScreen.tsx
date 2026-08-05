import { Icon } from './Icon'

export function WelcomeScreen({
  loading,
  onImport,
  onNew,
}: {
  loading: boolean
  onImport: () => void
  onNew: () => void
}) {
  return (
    <main className="welcome-screen">
      <div className="welcome-ambient welcome-ambient-one" />
      <div className="welcome-ambient welcome-ambient-two" />
      <section className="welcome-card">
        <div className="welcome-brand">
          <span className="welcome-logo">
            <Icon className="size-8" name="midi" />
          </span>
          <span>织音 · ZHIYIN</span>
        </div>
        <p className="welcome-kicker">BROWSER MIDI WORKSTATION</p>
        <h1>
          把旋律，放进
          <br />
          <em>可编辑的时间里。</em>
        </h1>
        <p className="welcome-copy">在浏览器中创作、整理和试听多轨 MIDI。文件只留在你的设备上。</p>
        <div className="welcome-actions">
          <button
            className="primary-welcome-action"
            disabled={loading}
            onClick={onNew}
            type="button"
          >
            <Icon className="size-5" name="add" />
            <span>
              <strong>创建空白 MIDI</strong>
              <small>120 BPM · 4/4 · 单轨</small>
            </span>
          </button>
          <button
            className="secondary-welcome-action"
            disabled={loading}
            onClick={onImport}
            type="button"
          >
            <Icon className="size-5" name="upload" />
            <span>
              <strong>导入 MIDI 文件</strong>
              <small>.mid 或 .midi · Type 0/1</small>
            </span>
          </button>
        </div>
        <div className="drop-hint">
          <span />
          也可以把 MIDI 文件拖到这里
          <span />
        </div>
        {loading ? (
          <div className="welcome-loading" role="status">
            <span className="spinner" />
            正在恢复本地会话…
          </div>
        ) : null}
      </section>
      <footer className="welcome-footer">
        <span>LOCAL FIRST</span>
        <i />
        <span>NO ACCOUNT</span>
        <i />
        <span>SMF 0 / 1</span>
      </footer>
    </main>
  )
}
