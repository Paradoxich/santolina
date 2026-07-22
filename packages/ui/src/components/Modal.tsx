'use client'

import React, { useEffect, useId, useRef } from 'react'
import { cn } from '../utils/cn'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Replaces the body's default padding — pass this when the children own
   * their own layout (e.g. a two-pane panel that runs to the edges).
   */
  bodyClassName?: string
  /** Class applied to the dialog surface — use to retone it. */
  className?: string
}

const sizeStyles: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  bodyClassName,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

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
      className={cn(
        'w-full rounded-modal shadow-lg',
        'p-0 bg-surface-card border border-card',
        'backdrop:bg-scrim',
        sizeStyles[size],
        className
      )}
      onClick={handleOverlayClick}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {title && (
        <div
          className={cn('flex items-center justify-between', 'px-6 pt-6 pb-3')}
        >
          <h2 id={titleId} className="text-heading font-semibold text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className={cn(
              'rounded-md p-1',
              'text-primary',
              'hover:bg-surface-hover',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-focus'
            )}
            aria-label="Close modal"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M13.3333 13.3333L2.66667 2.66667M13.3333 2.66667L2.66667 13.3333"
                stroke="currentColor"
                strokeWidth="1.33333"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}

      <div
        className={
          bodyClassName ??
          cn('px-6', title ? 'pt-3' : 'pt-6', footer ? 'pb-3' : 'pb-6')
        }
      >
        {children}
      </div>

      {footer && (
        <div
          className={cn(
            'px-6 pt-3 pb-6',
            'flex items-center justify-end gap-3'
          )}
        >
          {footer}
        </div>
      )}
    </dialog>
  )
}

export default Modal
