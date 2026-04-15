import React, { useState, useRef, useEffect } from 'react'

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}

const positionStyles: Record<NonNullable<TooltipProps['position']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2)}`)

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const child = React.cloneElement(children, {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': visible ? tooltipId.current : undefined,
  })

  return (
    <span className="relative inline-flex">
      {child}
      {visible && (
        <span
          id={tooltipId.current}
          role="tooltip"
          className={[
            'absolute z-50',
            'px-2 py-1',
            'text-xs font-medium',
            'bg-[var(--color-neutral-900)]',
            'text-white',
            'rounded-[var(--radius-md)]',
            'shadow-[var(--shadow-md)]',
            'pointer-events-none',
            'whitespace-nowrap',
            positionStyles[position],
          ].join(' ')}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export default Tooltip
