import React from 'react'
import { cn } from '../utils/cn'

export interface IconProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'width' | 'height'
> {
  /** Path to the icon asset (e.g. from a consuming app's icon registry). */
  src: string
  /** Renders at size × size, undistorted, regardless of the source SVG's
   * own aspect ratio — pass a mismatched viewBox and it still fits cleanly. */
  size?: number
  ref?: React.Ref<HTMLImageElement>
}

export function Icon({
  src,
  size = 16,
  alt = '',
  className,
  style,
  ref,
  ...props
}: IconProps) {
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={size}
      height={size}
      // Inline CSS size, not just the width/height attributes: preflight's
      // `img { height: auto }` overrides attributes and lets a non-square
      // source stretch the box. CSS wins over preflight.
      style={{ width: size, height: size, ...style }}
      className={cn('object-contain', className)}
      {...props}
    />
  )
}

export default Icon
