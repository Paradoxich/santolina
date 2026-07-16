import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button, Drawer, Icon, Tabs, useToast } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { DRAWER_MOTION } from '@/lib/drawer-motion'
import { DIARY_EVENT_LABELS } from '@/lib/diary-events'
import { addDiaryEntry } from '@/server/diary-actions'
import type { GroupedCareTips } from '@/lib/care-tips'
import type { CareTip } from '@/types/dashboard'

interface CareTipsDrawerProps {
  groups: GroupedCareTips
  onClose: () => void
}

/**
 * Drawer sections (Care Tips v2 § Surfaces), surfaced as filter tabs so any
 * of the three is one tap away — including Now / This week when empty, so the
 * structure stays legible when there's nothing time-sensitive.
 */
const SECTIONS: {
  key: keyof GroupedCareTips
  label: string
  emptyText: string
}[] = [
  { key: 'now', label: 'Now', emptyText: 'Nothing needs doing right now.' },
  {
    key: 'thisWeek',
    label: 'This week',
    emptyText: 'Nothing coming up this week.',
  },
  {
    key: 'goodToKnow',
    label: 'Good to know',
    emptyText: 'Nothing to note yet.',
  },
]

export function CareTipsDrawer({ groups, onClose }: CareTipsDrawerProps) {
  const router = useRouter()
  const { toast } = useToast()
  // Keyed by plantId:eventType so two tips for the same plant track separately.
  const [pending, setPending] = useState<string | null>(null)
  const [activeKey, setActiveKey] = useState<keyof GroupedCareTips>('now')

  const active = SECTIONS.find((s) => s.key === activeKey) ?? SECTIONS[0]!
  const activeTips = groups[active.key]

  const handleDidIt = async (tip: CareTip) => {
    if (!tip.plantId || !tip.eventType) return
    const key = `${tip.plantId}:${tip.eventType}`
    setPending(key)
    try {
      await addDiaryEntry({ plantId: tip.plantId, eventType: tip.eventType })
      router.refresh()
      toast({
        groupKey: key,
        title: `Logged as ${DIARY_EVENT_LABELS[tip.eventType].toLowerCase()}`,
        description: tip.plantName
          ? `Added to ${tip.plantName}'s diary.`
          : 'Added to the diary.',
        tone: 'positive',
      })
    } catch (err) {
      toast({
        groupKey: key,
        title: 'Could not log that',
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <Drawer
      label="Plant care"
      onClose={onClose}
      closeLabel="Close plant care"
      closeIcon={<Icon src={icons.close} />}
      panelComponent={motion.aside}
      panelProps={DRAWER_MOTION}
    >
      <div className="flex w-full shrink-0 flex-col gap-card-padding border-b border-card p-card-padding">
        <div className="flex w-full flex-col gap-item-gap">
          <h2 className="text-title font-semibold text-primary">Plant care</h2>
          <p className="text-body leading-normal text-secondary">
            What matters in your garden right now. Tap Did it to log an action
            to your diary.
          </p>
        </div>
        <Tabs
          items={SECTIONS.map((s) => ({
            value: s.key,
            label: s.label,
            count: groups[s.key].length,
          }))}
          value={activeKey}
          onChange={(v) => setActiveKey(v as keyof GroupedCareTips)}
        />
      </div>

      <div className="flex w-full flex-1 flex-col gap-tight-gap overflow-y-auto p-card-padding">
        {activeTips.length === 0 ? (
          <p className="text-body-small text-muted">{active.emptyText}</p>
        ) : (
          activeTips.map((tip, i) => (
            <TipRow
              key={`${tip.plantId ?? 'general'}-${i}`}
              tip={tip}
              pending={pending === `${tip.plantId}:${tip.eventType}`}
              onDidIt={() => handleDidIt(tip)}
            />
          ))
        )}
      </div>
    </Drawer>
  )
}

function TipRow({
  tip,
  pending,
  onDidIt,
}: {
  tip: CareTip
  pending: boolean
  onDidIt: () => void
}) {
  // The action pill logs the tip's event to the diary. It's labelled with the
  // past-tense event verb (Watered / Fertilized) rather than "Did it" so it
  // reads as logging one occurrence, not completing a recurring instruction.
  const eventLabel = tip.eventType ? DIARY_EVENT_LABELS[tip.eventType] : null
  return (
    <div className="flex w-full items-center justify-between gap-row-gap rounded-sm bg-surface-page p-inline-gap">
      <span className="min-w-0 flex-1 text-body leading-normal text-primary">
        {tip.text}
      </span>
      {eventLabel && tip.plantId ? (
        <Button
          variant="control"
          size="sm"
          onClick={onDidIt}
          disabled={pending}
          className="shrink-0"
          aria-label={`Log ${eventLabel.toLowerCase()} for ${tip.plantName ?? 'this plant'}`}
        >
          {pending ? 'Logging…' : eventLabel}
        </Button>
      ) : (
        tip.plantName && (
          <span className="shrink-0 whitespace-nowrap text-label text-muted">
            {tip.plantName}
          </span>
        )
      )}
    </div>
  )
}

export default CareTipsDrawer
