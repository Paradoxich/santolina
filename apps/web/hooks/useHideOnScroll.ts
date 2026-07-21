import { useEffect, useState, type RefObject } from 'react'

export interface HideOnScrollState {
  /** True while the user scrolls down (retract the element). */
  hidden: boolean
  /** True once the sticky element has reached the viewport top. */
  pinned: boolean
}

/**
 * Retracting-header behavior: `hidden` turns true while the user scrolls
 * down, false as soon as they scroll back up or reach the top. Movements
 * smaller than `thresholdPx` are ignored so trackpad jitter doesn't flicker
 * the value.
 *
 * Pass the sticky element's ref so retraction only kicks in once the element
 * is actually pinned (viewport top reached) — without it, a small scroll
 * would slide the element up over the content above its natural position.
 * The pinned state is also returned for pinned-only chrome (shadows,
 * dividers).
 */
export function useHideOnScroll(
  ref?: RefObject<HTMLElement | null>,
  thresholdPx = 8
): HideOnScrollState {
  const [hidden, setHidden] = useState(false)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const isPinned =
          y > 0 &&
          (!ref?.current || ref.current.getBoundingClientRect().top <= 0)
        setPinned(isPinned)
        if (y <= 0) {
          setHidden(false)
          lastY = 0
        } else if (Math.abs(y - lastY) > thresholdPx) {
          setHidden(y > lastY && isPinned)
          lastY = y
        }
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ref, thresholdPx])

  return { hidden, pinned }
}
