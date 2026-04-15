import React from 'react'

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error'
  title?: string
  description?: string
  onClose?: () => void
}

const variantStyles: Record<NonNullable<ToastProps['variant']>, string> = {
  default: [
    'bg-[var(--color-neutral-800)]',
    'text-white',
    'border-[var(--color-neutral-700)]',
  ].join(' '),
  success: [
    'bg-[var(--color-success-600)]',
    'text-white',
    'border-[var(--color-success-700)]',
  ].join(' '),
  warning: [
    'bg-[var(--color-warning-500)]',
    'text-white',
    'border-[var(--color-warning-600)]',
  ].join(' '),
  error: [
    'bg-[var(--color-error-600)]',
    'text-white',
    'border-[var(--color-error-700)]',
  ].join(' '),
}

const iconMap: Record<NonNullable<ToastProps['variant']>, string> = {
  default: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
}

export function Toast({
  variant = 'default',
  title,
  description,
  onClose,
  className = '',
  ...props
}: ToastProps) {
  return (
    <div
      className={[
        'flex items-start gap-3',
        'px-4 py-3',
        'rounded-[var(--radius-lg)]',
        'border',
        'shadow-[var(--shadow-lg)]',
        'min-w-[280px] max-w-sm',
        variantStyles[variant],
        className,
      ].join(' ')}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      <span className="text-base flex-shrink-0 mt-0.5" aria-hidden="true">
        {iconMap[variant]}
      </span>
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold text-sm leading-tight">{title}</p>
        )}
        {description && (
          <p className="text-sm opacity-90 mt-0.5">{description}</p>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
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
