import React from 'react'
import { cn } from '../utils/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}

export function Card({ children, className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'bg-surface-card rounded-lg',
        'border border-card',
        'shadow-sm',
        'overflow-hidden',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  children,
  className,
  ref,
  ...props
}: CardHeaderProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'px-card-padding py-row-gap',
        'border-b border-divider',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardBody({
  children,
  className,
  ref,
  ...props
}: CardBodyProps) {
  return (
    <div
      ref={ref}
      className={cn('px-card-padding py-row-gap', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardFooter({
  children,
  className,
  ref,
  ...props
}: CardFooterProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'px-card-padding py-row-gap',
        'border-t border-divider',
        'bg-surface-subtle',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export default Card
