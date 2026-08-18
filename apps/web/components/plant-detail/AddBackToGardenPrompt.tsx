import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, FormError, Icon } from '@paradoxui/ui'
import { failureMessage } from '@/lib/failure'
import { icons } from '@/lib/icons'
import { addToPalette } from '@/server/palette-actions'

interface AddBackToGardenPromptProps {
  plantId: string
  /** Notifies the page's palette state after a successful re-add, so the page's own header actions and Story eligibility flip immediately. */
  onAddedBackToGarden: (result: { paletteId: string }) => void
}

/**
 * The foot of a removed plant's page: says the notes are read-only and offers
 * the way back.
 *
 * This was StoryComposer until 2026-08-18, and it carried ~200 lines of
 * capture UI — event chips, an auto-growing textarea, photo attachment, a
 * submit path — that could not render. PlantDetailPage mounted it only when
 * `!isGrowing`, and it returned this prompt for exactly that case, so the
 * composer half was unreachable from both directions. It was superseded when
 * growing plants moved to capturing notes through the Diary card and
 * /plants/[id]/notes; nothing removed the code it replaced.
 */
export function AddBackToGardenPrompt({
  plantId,
  onAddedBackToGarden,
}: AddBackToGardenPromptProps) {
  const router = useRouter()
  const [isReAdding, setIsReAdding] = useState(false)
  const [reAddError, setReAddError] = useState<string | null>(null)

  const handleAddBackToGarden = async () => {
    setIsReAdding(true)
    setReAddError(null)
    try {
      const result = await addToPalette({
        plantId,
        status: 'planted',
        source: 'manual',
      })
      onAddedBackToGarden({ paletteId: result.id })
      router.refresh()
    } catch (err) {
      setReAddError(
        failureMessage(err, 'Could not add this plant back. Try again.')
      )
    } finally {
      setIsReAdding(false)
    }
  }

  return (
    <div className="sticky bottom-0 flex w-full shrink-0 flex-col gap-inline-gap border-t border-card bg-surface-card p-card-padding">
      <p className="text-body-small text-muted">
        No longer in your garden. Notes are read-only.
      </p>
      <Button
        variant="control"
        size="sm"
        onClick={handleAddBackToGarden}
        disabled={isReAdding}
        className="w-full justify-between"
      >
        {isReAdding ? 'Adding back…' : 'Add back to garden'}
        <Icon src={icons.arrowRight} />
      </Button>
      {reAddError && <FormError>{reAddError}</FormError>}
    </div>
  )
}
