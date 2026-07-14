import type { ReactNode } from 'react'

export interface DrawerSectionProps {
  /** Uppercase section label. */
  label: string
  children: ReactNode
}

/**
 * Uppercase section label followed by its content, providing a consistent
 * section rhythm inside drawers and detail panels.
 */
export function DrawerSection({ label, children }: DrawerSectionProps) {
  return (
    <section className="flex w-full flex-col gap-inline-gap">
      <h3 className="w-full text-label font-medium uppercase tracking-label text-muted">
        {label}
      </h3>
      {children}
    </section>
  )
}

export default DrawerSection
