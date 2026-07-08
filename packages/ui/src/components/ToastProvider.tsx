'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import { Toast, type ToastAction, type ToastProps } from './Toast'

export interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastProps['variant']
  actions?: ToastAction[]
  /** Milliseconds before auto-dismiss. Defaults to 6000. */
  duration?: number
  /**
   * When provided, a new toast with the same groupKey replaces any
   * earlier one still showing instead of stacking — e.g. rapid add-then-
   * remove on the same entity. Without this, an older toast's action
   * (like Undo) can stay clickable after a newer action has already
   * superseded it, acting on stale state.
   */
  groupKey?: string
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 6000

interface ToastEntry extends ToastOptions {
  id: number
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++
      setToasts((current) => [
        ...current.filter(
          (t) => !options.groupKey || t.groupKey !== options.groupKey
        ),
        { ...options, id },
      ])
      window.setTimeout(() => dismiss(id), options.duration ?? DEFAULT_DURATION)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 md:items-end md:px-6">
        {toasts.map(({ id, actions, groupKey: _groupKey, ...toastProps }) => (
          <div key={id} className="pointer-events-auto">
            <Toast
              {...toastProps}
              actions={actions?.map((action) => ({
                ...action,
                // Any action click dismisses its own toast — prevents
                // a re-click (e.g. double Undo) from firing twice.
                onClick: () => {
                  action.onClick()
                  dismiss(id)
                },
              }))}
              onClose={() => dismiss(id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
