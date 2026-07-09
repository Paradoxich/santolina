import React from 'react'
import { cn } from '../utils/cn'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'positive' | 'warning' | 'critical'
  title?: string
  description?: string
  actions?: ToastAction[]
  onClose?: () => void
  ref?: React.Ref<HTMLDivElement>
}

const toneStyles: Record<NonNullable<ToastProps['tone']>, string> = {
  default: ['bg-surface-inverse', 'text-inverse', 'border-transparent'].join(
    ' '
  ),
  positive: ['bg-fill-positive', 'text-on-accent', 'border-transparent'].join(
    ' '
  ),
  warning: ['bg-fill-warning', 'text-on-accent', 'border-transparent'].join(
    ' '
  ),
  critical: ['bg-fill-critical', 'text-on-accent', 'border-transparent'].join(
    ' '
  ),
}

const iconMap: Record<NonNullable<ToastProps['tone']>, string> = {
  default: 'ℹ',
  positive: '✓',
  warning: '⚠',
  critical: '✕',
}

export function Toast({
  tone = 'default',
  title,
  description,
  actions = [],
  onClose,
  className,
  ref,
  ...props
}: ToastProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-start gap-3',
        'px-4 py-3',
        'rounded-lg',
        'border',
        'shadow-lg',
        'min-w-[280px] max-w-sm',
        toneStyles[tone],
        className
      )}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      <span className="text-base flex-shrink-0 mt-0.5" aria-hidden="true">
        {iconMap[tone]}
      </span>
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold text-sm leading-tight">{title}</p>
        )}
        {description && (
          <p className="text-sm opacity-90 mt-0.5">{description}</p>
        )}
        {actions.length > 0 && (
          <div className="mt-2 flex items-center gap-4">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="text-sm font-semibold underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
          aria-label="Dismiss notification"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

export default Toast
