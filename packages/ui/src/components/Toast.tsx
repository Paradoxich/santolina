import React from 'react'
import { cn } from '../utils/cn'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'neutral' | 'positive' | 'warning' | 'critical'
  message: string
  actions?: ToastAction[]
  ref?: React.Ref<HTMLDivElement>
}

const toneStyles: Record<NonNullable<ToastProps['tone']>, string> = {
  neutral: ['bg-toast-neutral', 'border-toast-neutral'].join(' '),
  positive: ['bg-toast-positive', 'border-toast-positive'].join(' '),
  warning: ['bg-toast-warning', 'border-toast-warning'].join(' '),
  critical: ['bg-toast-critical', 'border-toast-critical'].join(' '),
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-4 shrink-0 text-primary"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="2">
        <path d="M12 9v5m0 3.5v.5" />
        <path
          strokeLinejoin="round"
          d="M2.232 19.016L10.35 3.052c.713-1.403 2.59-1.403 3.302 0l8.117 15.964C22.45 20.36 21.544 22 20.116 22H3.883c-1.427 0-2.334-1.64-1.65-2.984"
        />
      </g>
    </svg>
  )
}

function PositiveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-4 shrink-0 text-primary"
      aria-hidden="true"
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m4 12l6 6L20 6"
      />
    </svg>
  )
}

function CriticalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="size-4 shrink-0 text-primary"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" d="M15 15L9 9m6 0l-6 6" />
        <circle cx="12" cy="12" r="10" />
      </g>
    </svg>
  )
}

const icons: Partial<
  Record<NonNullable<ToastProps['tone']>, () => React.JSX.Element>
> = {
  positive: PositiveIcon,
  warning: WarningIcon,
  critical: CriticalIcon,
}

export function Toast({
  tone = 'neutral',
  message,
  actions = [],
  className,
  ref,
  ...props
}: ToastProps) {
  const ToneIcon = icons[tone]

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3',
        'p-4',
        'rounded-md border backdrop-blur',
        'text-body-small text-primary',
        'min-w-[280px] max-w-sm',
        toneStyles[tone],
        className
      )}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      {ToneIcon && <ToneIcon />}
      <p className="min-w-0 flex-1 [word-break:break-word]">{message}</p>
      {actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-4">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="whitespace-nowrap font-medium hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default Toast
