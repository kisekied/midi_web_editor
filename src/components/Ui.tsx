import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export const ToolButton = forwardRef<
  HTMLButtonElement,
  {
    icon?: IconName
    label: string
    active?: boolean
    compact?: boolean
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function ToolButton(
  { icon, label, active = false, compact = false, children, className = '', ...props },
  ref,
) {
  return (
    <button
      aria-label={label}
      className={`tool-button ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''} ${className}`}
      ref={ref}
      title={label}
      type="button"
      {...props}
    >
      {icon ? <Icon className="size-4" name={icon} /> : null}
      {children}
    </button>
  )
})

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
