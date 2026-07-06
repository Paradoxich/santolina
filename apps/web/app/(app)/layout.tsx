import { AppSidebar } from '@/components/AppSidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--color-background-page)]">
      <AppSidebar />
      <main className="ml-[272px] mr-12">{children}</main>
    </div>
  )
}
