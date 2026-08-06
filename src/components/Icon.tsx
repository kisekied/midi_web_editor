import type { SVGProps } from 'react'

export type IconName =
  | 'add'
  | 'close'
  | 'copy'
  | 'download'
  | 'file'
  | 'loop'
  | 'midi'
  | 'moon'
  | 'pause'
  | 'play'
  | 'paste'
  | 'redo'
  | 'stop'
  | 'sun'
  | 'trash'
  | 'undo'
  | 'upload'
  | 'warning'
  | 'zoom-in'
  | 'zoom-out'

const paths: Record<IconName, string[]> = {
  add: ['M12 5v14M5 12h14'],
  close: ['m6 6 12 12M18 6 6 18'],
  copy: ['M9 9h10v10H9z', 'M5 15H4V5h10v1'],
  download: ['M12 3v12m0 0 4-4m-4 4-4-4', 'M5 19h14'],
  file: ['M7 3h7l4 4v14H7z', 'M14 3v5h5'],
  loop: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
  midi: ['M4 7h16v10H4z', 'M7 10v4m3-4v4m4-4v4m3-4v4'],
  moon: ['M20 15.2A8.3 8.3 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2z'],
  pause: ['M8 5v14M16 5v14'],
  paste: ['M9 5h6', 'M9 3h6v4H9z', 'M7 5H5v16h14V5h-2', 'M9 12h6m-6 4h6'],
  play: ['m8 5 11 7-11 7z'],
  redo: ['M20 7v5h-5', 'M19 12a8 8 0 1 0-2 5'],
  stop: ['M7 7h10v10H7z'],
  sun: [
    'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
    'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  ],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'm7 7 1 14h10l1-14', 'M10 11v6m4-6v6'],
  undo: ['M4 7v5h5', 'M5 12a8 8 0 1 1 2 5'],
  upload: ['M12 21V9m0 0 4 4m-4-4-4 4', 'M5 5h14'],
  warning: ['M12 3 2.8 20h18.4z', 'M12 9v5m0 4h.01'],
  'zoom-in': ['m21 21-4.35-4.35', 'M11 8v6m-3-3h6', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  'zoom-out': ['m21 21-4.35-4.35', 'M8 11h6', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
}

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  )
}
