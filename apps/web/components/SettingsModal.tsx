'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Icon, IconButton, Modal } from '@paradoxui/ui'
import { icons, type IconName } from '@/lib/icons'
import { LocationPickerModal } from '@/components/dashboard/LocationPickerModal'
import { resetGarden, deleteAccount } from '@/server/account-actions'

// NOTE: functional copy + layout, not yet through Ana's voice/design pass.
type SectionId = 'garden' | 'account'

const sections: { id: SectionId; label: string; icon: IconName }[] = [
  { id: 'garden', label: 'Garden', icon: 'garden' },
  { id: 'account', label: 'Account', icon: 'account' },
]

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  email: string | null
  city: string | null
  country: string | null
}

/** One label + description on the left, one control on the right. */
function SettingsRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-divider py-card-padding last:border-b-0">
      <div className="min-w-0">
        <p className="text-body text-primary">{title}</p>
        {description && (
          <p className="text-body-small text-secondary">{description}</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

export function SettingsModal({
  isOpen,
  onClose,
  email,
  city,
  country,
}: SettingsModalProps) {
  const router = useRouter()
  const [section, setSection] = useState<SectionId>('garden')
  const [locationOpen, setLocationOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState<'reset' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) return
    setSection('garden')
    setError(null)
  }, [isOpen])

  async function handleReset() {
    setBusy('reset')
    setError(null)
    try {
      await resetGarden()
      setResetOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  async function handleDelete() {
    setBusy('delete')
    setError(null)
    try {
      // Redirects on success, so control does not return here.
      await deleteAccount()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(null)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        bodyClassName="p-0"
        className="border-card-translucent bg-surface-card"
      >
        <div className="flex min-h-[420px] flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col border-b border-card-translucent p-inline-gap sm:w-[180px] sm:border-b-0 sm:border-r">
            <IconButton
              type="button"
              variant="control"
              size="sm"
              onClick={onClose}
              aria-label="Close settings"
              // rounded-md (12px), not IconButton's default 8px, so the corner
              // matches the nav items and the modal surface around it.
              className="self-start rounded-md"
            >
              <Icon src={icons.close} size={16} />
            </IconButton>

            <nav
              aria-label="Settings sections"
              className="mt-row-gap flex gap-tight-gap sm:flex-col"
            >
              {sections.map((item) => {
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => setSection(item.id)}
                    className={[
                      'flex items-center gap-item-gap rounded-md px-row-gap py-item-gap text-left',
                      'flex-1 sm:w-full sm:flex-none',
                      'text-body text-primary transition-colors duration-normal',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      // A step lighter than the sidebar's nav-active (sage-100)
                      // so the fill reads on the modal's sage-200 surface.
                      active ? 'bg-surface-subtle' : 'hover:bg-surface-subtle',
                    ].join(' ')}
                  >
                    <Icon src={icons[item.icon]} />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="min-w-0 flex-1 p-row-gap">
            <h2 className="text-section font-medium text-primary">
              {sections.find((s) => s.id === section)?.label}
            </h2>

            <div className="mt-2">
              {section === 'garden' && (
                <>
                  <SettingsRow
                    title="Location"
                    description={
                      city
                        ? `${city}${country ? `, ${country}` : ''}`
                        : 'Not set'
                    }
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocationOpen(true)}
                    >
                      Change
                    </Button>
                  </SettingsRow>

                  <SettingsRow
                    title="Reset garden"
                    description="Remove all plants and diary entries. Your location stays."
                  >
                    <Button
                      variant="destructive-ghost"
                      size="sm"
                      onClick={() => setResetOpen(true)}
                    >
                      Reset
                    </Button>
                  </SettingsRow>
                </>
              )}

              {section === 'account' && (
                <>
                  <SettingsRow
                    title="Signed in as"
                    description={email ?? 'Unknown'}
                  />

                  <SettingsRow
                    title="Delete account"
                    description="Permanently delete your account and everything in it."
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                    >
                      Delete
                    </Button>
                  </SettingsRow>
                </>
              )}

              {error && (
                <p
                  className="pt-card-padding text-body-small text-critical"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <LocationPickerModal
        isOpen={locationOpen}
        onClose={() => setLocationOpen(false)}
        currentCity={city}
        currentCountry={country}
      />

      <Modal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset your garden?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              isLoading={busy === 'reset'}
              onClick={handleReset}
            >
              Reset garden
            </Button>
          </div>
        }
      >
        <p className="text-body text-secondary">
          This removes every plant and diary entry from your garden. Your
          location stays. This cannot be undone.
        </p>
      </Modal>

      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              isLoading={busy === 'delete'}
              onClick={handleDelete}
            >
              Delete account
            </Button>
          </div>
        }
      >
        <p className="text-body text-secondary">
          This permanently deletes your account, your garden, and all your
          plants and diary entries. This cannot be undone.
        </p>
      </Modal>
    </>
  )
}

export default SettingsModal
