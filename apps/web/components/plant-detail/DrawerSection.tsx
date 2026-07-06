import type { ReactNode } from 'react'

interface DrawerSectionProps {
  label: string
  children: ReactNode
}

/** Uppercase section label + content, matching the drawer's section rhythm. */
export function DrawerSection({ label, children }: DrawerSectionProps) {
  return (
    <section className="flex w-full flex-col gap-[var(--space-inline-gap)]">
      <h3 className="w-full text-[length:var(--font-size-label)] font-medium uppercase tracking-[0.05em] text-[var(--text-section-label)]">
        {label}
      </h3>
      {children}
    </section>
  )
}
