'use client'

import { useState } from 'react'
import { Tabs } from '@paradoxui/ui'

export interface DesignSystemTab {
  value: string
  label: string
  content: React.ReactNode
}

export function DesignSystemTabs({ tabs }: { tabs: DesignSystemTab[] }) {
  const [active, setActive] = useState(tabs[0]?.value ?? '')
  const activeTab = tabs.find((t) => t.value === active) ?? tabs[0]

  if (!activeTab) return null

  return (
    <div className="flex flex-col gap-section-break">
      <div className="overflow-x-auto border-b border-divider">
        <Tabs
          items={tabs.map(({ value, label }) => ({ value, label }))}
          value={active}
          onChange={setActive}
        />
      </div>
      <div className="flex flex-col gap-section-break">{activeTab.content}</div>
    </div>
  )
}

export default DesignSystemTabs
