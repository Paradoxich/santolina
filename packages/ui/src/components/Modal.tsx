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
  /**
   * Blurs whatever sits behind the scrim. Use when this dialog opens on top
   * of another one, so the modal underneath recedes instead of competing.
   */
  blurBackdrop?: boolean
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
  blurBackdrop = false,
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
        blurBackdrop && 'backdrop:backdrop-blur-sm',
        sizeStyles[size],
        className
      )}
      onClick={handleOverlayClick}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {title && (
        <div
          className={cn(
            'flex items-center justify-between',
            'px-modal-padding pt-modal-padding pb-item-gap'
          )}
        >
          <h2 id={titleId} className="text-heading font-semibold text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className={cn(
              'rounded-md p-tight-gap',
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
          cn(
            'px-modal-padding',
            title ? 'pt-item-gap' : 'pt-modal-padding',
            footer ? 'pb-item-gap' : 'pb-modal-padding'
          )
        }
      >
        {children}
      </div>

      {footer && (
        <div
          className={cn(
            'px-modal-padding pt-item-gap pb-modal-padding',
            'flex items-center justify-end gap-item-gap'
          )}
        >
          {footer}
        </div>
      )}
    </dialog>
  )
}

export default Modal
