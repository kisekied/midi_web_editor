import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installPlaybackEditGuard } from './audio/playbackEngine'
import './index.css'
import { installSessionAutosave } from './state/sessionRepository'

const removeAutosave = installSessionAutosave()
const removePlaybackGuard = installPlaybackEditGuard()

window.addEventListener('pagehide', () => {
  removeAutosave()
  removePlaybackGuard()
})

const root = document.getElementById('root')
if (!root) throw new Error('缺少应用挂载节点')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
