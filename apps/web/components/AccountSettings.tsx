'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, CardBody, CardHeader, Icon, Modal } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { LocationPickerModal } from '@/components/dashboard/LocationPickerModal'
import { signOut, resetGarden, deleteAccount } from '@/server/account-actions'

// NOTE: functional copy + layout, not yet through Ana's voice/design pass.
interface AccountSettingsProps {
  email: string | null
  city: string | null
  country: string | null
}

export function AccountSettings({
  email,
  city,
  country,
}: AccountSettingsProps) {
  const router = useRouter()
  const [locationOpen, setLocationOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState<'reset' | 'delete' | 'signout' | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    <div className="max-w-[640px] pb-16 pt-8 md:pt-12">
      <h1 className="text-title font-semibold text-primary">Account</h1>

      <div className="mt-8 flex flex-col gap-section-gap">
        <Card className="border-[color:var(--color-surface-page)] shadow-none">
          <CardHeader className="border-[color:var(--color-surface-page)] py-card-padding">
            <h2 className="text-section font-medium leading-none text-primary">
              Profile
            </h2>
          </CardHeader>
          <CardBody className="flex items-center justify-between gap-4 py-card-padding">
            <div>
              <p className="text-body text-primary">Signed in as</p>
              <p className="text-body-small text-secondary">
                {email ?? 'Unknown'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              isLoading={busy === 'signout'}
              onClick={() => {
                setBusy('signout')
                signOut()
              }}
            >
              Sign out
            </Button>
          </CardBody>
        </Card>

        <Card className="border-[color:var(--color-surface-page)] shadow-none">
          <CardHeader className="border-[color:var(--color-surface-page)] py-card-padding">
            <h2 className="text-section font-medium leading-none text-primary">
              Garden
            </h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-card-padding py-card-padding">
            <button
              type="button"
              className="flex cursor-pointer items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              onClick={() => setLocationOpen(true)}
            >
              <div>
                <p className="text-body text-primary">Location</p>
                <p className="text-body-small text-secondary">
                  {city ? `${city}${country ? `, ${country}` : ''}` : 'Not set'}
                </p>
              </div>
              <Icon src={icons.arrowRight} size={16} />
            </button>

            <div className="flex items-center justify-between gap-4 border-t border-divider pt-card-padding">
              <div>
                <p className="text-body text-primary">Reset garden</p>
                <p className="text-body-small text-secondary">
                  Remove all plants and diary entries. Your location stays.
                </p>
              </div>
              <Button
                variant="destructive-ghost"
                size="sm"
                onClick={() => setResetOpen(true)}
              >
                Reset
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="border-[color:var(--color-surface-page)] bg-surface-critical shadow-none">
          <CardHeader className="border-[color:var(--color-surface-page)] py-card-padding">
            <h2 className="text-section font-medium leading-none text-primary">
              Danger zone
            </h2>
          </CardHeader>
          <CardBody className="flex items-center justify-between gap-4 py-card-padding">
            <div>
              <p className="text-body text-primary">Delete account</p>
              <p className="text-body-small text-secondary">
                Permanently delete your account and everything in it.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </CardBody>
        </Card>

        {error && (
          <p className="text-body-small text-critical" role="alert">
            {error}
          </p>
        )}
      </div>

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
    </div>
  )
}
