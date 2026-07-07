import { AppSidebar } from '@/components/AppSidebar'
import { MobileTabBar } from '@/components/MobileTabBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-page">
      <AppSidebar />
      <main className="px-4 pb-20 md:ml-[272px] md:mr-12 md:px-0 md:pb-0">
        {children}
      </main>
      <MobileTabBar />
    </div>
  )
}
