import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export function ToolButton({
  icon,
  label,
  active = false,
  compact = false,
  children,
  className = '',
  ...props
}: {
  icon?: IconName
  label: string
  active?: boolean
  compact?: boolean
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      className={`tool-button ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''} ${className}`}
      title={label}
      type="button"
      {...props}
    >
      {icon ? <Icon className="size-4" name={icon} /> : null}
      {children}
    </button>
  )
}

export function Divider() {
  return <span aria-hidden="true" className="toolbar-divider" />
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'violet' | 'warning'
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
