import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Modal>

function DefaultModalStory() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Modal</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Archive all entries"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Confirm</Button>
          </>
        }
      >
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Are you sure you want to archive all entries from today?
        </p>
      </Modal>
    </>
  )
}

export const Default: Story = {
  render: () => <DefaultModalStory />,
}

/** `xl` + `bodyClassName` for panels that own their own layout. */
function TwoPaneModalStory() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open settings</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        size="xl"
        bodyClassName="p-0"
        className="border-card-translucent bg-surface-card"
      >
        <div className="flex min-h-[420px]">
          <div className="flex w-[180px] shrink-0 flex-col border-r border-card-translucent p-inline-gap">
            <span className="flex size-8 items-center justify-center self-start rounded-md border border-card bg-surface-control text-body text-primary">
              ✕
            </span>
            <nav className="mt-row-gap">
              <p className="rounded-md bg-surface-subtle px-row-gap py-item-gap text-body text-primary">
                General
              </p>
            </nav>
          </div>
          <div className="flex-1 p-row-gap">
            <h2 className="text-section font-medium text-primary">General</h2>
          </div>
        </div>
      </Modal>
    </>
  )
}

export const TwoPane: Story = {
  render: () => <TwoPaneModalStory />,
}

/** A confirm opening on top of a panel — `blurBackdrop` sinks the one below. */
function StackedModalStory() {
  const [panel, setPanel] = useState(false)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Button onClick={() => setPanel(true)}>Open settings</Button>
      <Modal
        isOpen={panel}
        onClose={() => setPanel(false)}
        size="xl"
        className="border-card-translucent bg-surface-card"
      >
        <div className="min-h-[320px]">
          <h2 className="text-section font-medium text-primary">Garden</h2>
          <Button
            variant="destructive-ghost"
            className="mt-row-gap"
            onClick={() => setConfirm(true)}
          >
            Reset
          </Button>
        </div>
      </Modal>
      <Modal
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        title="Reset your garden?"
        size="sm"
        blurBackdrop
        footer={
          <Button variant="destructive" onClick={() => setConfirm(false)}>
            Reset garden
          </Button>
        }
      >
        <p className="text-body text-secondary">This cannot be undone.</p>
      </Modal>
    </>
  )
}

export const StackedBlurredBackdrop: Story = {
  render: () => <StackedModalStory />,
}
