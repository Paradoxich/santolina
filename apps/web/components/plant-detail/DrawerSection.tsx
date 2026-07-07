import type { ReactNode } from 'react'

interface DrawerSectionProps {
  label: string
  children: ReactNode
}

/** Uppercase section label + content, matching the drawer's section rhythm. */
export function DrawerSection({ label, children }: DrawerSectionProps) {
  return (
    <section className="flex w-full flex-col gap-inline-gap">
      <h3 className="w-full text-label font-medium uppercase tracking-[0.05em] text-muted">
        {label}
      </h3>
      {children}
    </section>
  )
}
