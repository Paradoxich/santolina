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
