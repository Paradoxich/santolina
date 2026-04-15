import React from 'react'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  initials?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeStyles: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
}

export function Avatar({
  src,
  alt = '',
  initials,
  size = 'md',
  className = '',
  ...props
}: AvatarProps) {
  return (
    <div
      className={[
        'relative inline-flex items-center justify-center',
        'rounded-[var(--radius-full)]',
        'overflow-hidden',
        'bg-[var(--color-primary-100)]',
        'text-[var(--color-primary-700)]',
        'font-medium',
        'select-none',
        sizeStyles[size],
        className,
      ].join(' ')}
      aria-label={alt || initials}
      role="img"
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span aria-hidden="true">
          {initials?.slice(0, 2).toUpperCase() ?? '?'}
        </span>
      )}
    </div>
  )
}

export default Avatar
