import React from 'react'
import { cn } from '../utils/cn'

// The one way a form failure is spoken. Not a tone-agnostic message line: a
// form failure is always `critical`, so the tone is fixed here rather than
// passed in, and there is nothing to get wrong at the call site.
//
// It covers two placements with one voice. `align="start"` sits under the field
// that is wrong and is wired to it by id; `align="center"` sits in a card's
// single failure slot, where the fault belongs to the request rather than to
// any one field. Same type role, same colour role, same live region either way
// — which is the point, because those three drifting apart is how a form ends
// up with four different-looking errors.
//
// `role="alert"` is on the element, so mounting it announces the message. A
// caller that keeps this mounted and swaps its text gets the announcement too;
// a caller that needs the region to exist before there is a message should
// render nothing instead of rendering this empty.

export interface FormErrorProps {
  /** The message. Render nothing rather than passing an empty string. */
  children: React.ReactNode
  /**
   * Ties the message to its field. Pass the same value to the input's
   * `aria-describedby`, and set `aria-invalid` on that input.
   */
  id?: string
  /** `start` under a field, `center` in a card's failure slot. */
  align?: 'start' | 'center'
  className?: string
}

export function FormError({
  children,
  id,
  align = 'start',
  className,
}: FormErrorProps) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'text-body-small text-critical',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </p>
  )
}

export default FormError
