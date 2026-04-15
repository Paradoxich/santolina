import React, { useEffect, useRef } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose()
  }

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      className={[
        'w-full rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]',
        'p-0 bg-white border border-[var(--color-neutral-200)]',
        'backdrop:bg-black/50',
        sizeStyles[size],
      ].join(' ')}
      onClick={handleOverlayClick}
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {title && (
        <div
          className={[
            'flex items-center justify-between',
            'px-6 py-4',
            'border-b border-[var(--color-neutral-200)]',
          ].join(' ')}
        >
          <h2
            id="modal-title"
            className="text-lg font-semibold text-[var(--color-neutral-900)]"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className={[
              'rounded-[var(--radius-md)] p-1',
              'text-[var(--color-neutral-500)]',
              'hover:bg-[var(--color-neutral-100)]',
              'hover:text-[var(--color-neutral-700)]',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--color-primary-500)]',
            ].join(' ')}
            aria-label="Close modal"
          >
            <svg
              width="20"
              height="20"
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
        </div>
      )}

      <div className="px-6 py-4">{children}</div>

      {footer && (
        <div
          className={[
            'px-6 py-4',
            'border-t border-[var(--color-neutral-200)]',
            'bg-[var(--color-neutral-50)]',
            'flex items-center justify-end gap-3',
          ].join(' ')}
        >
          {footer}
        </div>
      )}
    </dialog>
  )
}

export default Modal
