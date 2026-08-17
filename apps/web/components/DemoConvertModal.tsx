'use client'

import { useState } from 'react'
import { FormError, Modal } from '@paradoxui/ui'
import { UserFacingError } from '@/lib/failure'
import { AuthOptions } from '@/components/AuthOptions'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'

// "Keep this garden" — the same card as /login, in a dialog.
//
// The controls are shared (AuthOptions), but the actions behind them are not
// sign-in actions: this visitor already has a session and a garden. Both paths
// upgrade the anonymous account in place, so the user id never changes and the
// palette and diary carry over untouched:
//
//   · email  -> updateUser({ email }), confirmed by the emailed link
//   · Google -> linkIdentity(), which attaches a Google identity to the
//               existing user rather than signing a different one in
//
// Signing in normally here would be the wrong thing entirely: it would swap
// this session for another account and abandon the garden they just built.
//
// Copy approved by Ana, July 29 2026.

export interface DemoConvertModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DemoConvertModal({ isOpen, onClose }: DemoConvertModalProps) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function keepWithEmail(email: string) {
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/auth/callback` }
    )
    if (error) {
      throw new UserFacingError(
        error.message.toLowerCase().includes('already')
          ? 'That email already has an account. Log in to it instead.'
          : 'We could not send the link. Check the address and try again.'
      )
    }
  }

  async function keepWithGoogle() {
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    // Manual linking has to be enabled on the Supabase project for this to
    // work; without it the call fails here rather than at Google.
    if (error) throw new UserFacingError('Google is not available right now.')
  }

  function handleClose() {
    setError(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      className="border-card-translucent bg-surface-card"
    >
      {sentTo ? (
        <div className="flex w-full flex-col items-center gap-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-title font-semibold text-primary">
              Check your email
            </h2>
            <p className="text-body text-secondary">
              We sent a link to {sentTo}. Open it on this device and this garden
              is yours to keep.
            </p>
          </div>
          <button
            type="button"
            className="text-body-small font-semibold text-secondary hover:text-primary"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-8">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-title font-semibold text-primary">
              Keep this garden
            </h2>
          </div>

          {/* Same failure slot as /login, same component: this card is the
              sign-in card in a dialog, so a failure has to look identical. */}
          {error && <FormError align="center">{error}</FormError>}

          <AuthOptions
            onGoogle={keepWithGoogle}
            onEmail={keepWithEmail}
            onSent={setSentTo}
            onError={setError}
            submitLabel="Keep this garden"
          />
        </div>
      )}
    </Modal>
  )
}
