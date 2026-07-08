import React from 'react'

export interface IconProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'width' | 'height'
> {
  /** Path to the icon asset (e.g. from a consuming app's icon registry). */
  src: string
  /** Renders at size × size, undistorted, regardless of the source SVG's
   * own aspect ratio — pass a mismatched viewBox and it still fits cleanly. */
  size?: number
}

export function Icon({
  src,
  size = 16,
  alt = '',
  className = '',
  style,
  ...props
}: IconProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      // Inline CSS size, not just the width/height attributes: preflight's
      // `img { height: auto }` overrides attributes and lets a non-square
      // source stretch the box. CSS wins over preflight.
      style={{ width: size, height: size, ...style }}
      className={['object-contain', className].join(' ').trim()}
      {...props}
    />
  )
}

export default Icon
