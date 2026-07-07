import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={[
        'bg-surface-card rounded-lg',
        'border border-card',
        'shadow-sm',
        'overflow-hidden',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  children,
  className = '',
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={['px-6 py-4', 'border-b border-divider', className].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardBody({
  children,
  className = '',
  ...props
}: CardBodyProps) {
  return (
    <div className={['px-6 py-4', className].join(' ')} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({
  children,
  className = '',
  ...props
}: CardFooterProps) {
  return (
    <div
      className={[
        'px-6 py-4',
        'border-t border-divider',
        'bg-surface-subtle',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}

export default Card
