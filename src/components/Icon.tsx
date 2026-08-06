import {
  ClipboardPaste,
  Copy,
  Download,
  File,
  KeyboardMusic,
  type LucideIcon,
  type LucideProps,
  Moon,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat2,
  Square,
  Sun,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

const icons = {
  add: Plus,
  close: X,
  copy: Copy,
  download: Download,
  file: File,
  loop: Repeat2,
  midi: KeyboardMusic,
  moon: Moon,
  pause: Pause,
  paste: ClipboardPaste,
  play: Play,
  redo: Redo2,
  stop: Square,
  sun: Sun,
  trash: Trash2,
  undo: Undo2,
  upload: Upload,
  warning: TriangleAlert,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof icons

export function Icon({ name, ...props }: { name: IconName } & LucideProps) {
  const LucideComponent = icons[name]
  return <LucideComponent aria-hidden="true" strokeWidth={1.8} {...props} />
}
