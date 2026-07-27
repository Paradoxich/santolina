'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { AddNoteModal } from '@/components/AddNoteModal'

interface AddNoteContextValue {
  openAddNote: () => void
}

const AddNoteContext = createContext<AddNoteContextValue | null>(null)

export function useAddNote(): AddNoteContextValue {
  const ctx = useContext(AddNoteContext)
  if (!ctx) throw new Error('useAddNote must be used inside AddNoteProvider')
  return ctx
}

/**
 * Owns the one add-note dialog for the whole app shell. It lives here rather
 * than in the sidebar because the sidebar is `hidden` below md — a dialog
 * inside a display:none ancestor never renders, even in the top layer — and
 * because the mobile tab bar needs the same action.
 *
 * UI infrastructure, not app state: context is the sanctioned tool for this
 * (see CLAUDE.md), the same way the kit's toast provider works.
 */
export function AddNoteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialPlantId, setInitialPlantId] = useState<string | null>(null)

  const openAddNote = useCallback(() => {
    // Read the plant off the URL at open time rather than with
    // useSearchParams: this only ever runs from a click, and the hook would
    // otherwise opt the whole app shell out of static rendering.
    const plantId = new URLSearchParams(window.location.search).get('plant')
    setInitialPlantId(plantId)
    setIsOpen(true)
  }, [])

  return (
    <AddNoteContext.Provider value={{ openAddNote }}>
      {children}
      <AddNoteModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialPlantId={initialPlantId}
      />
    </AddNoteContext.Provider>
  )
}

export default AddNoteProvider
