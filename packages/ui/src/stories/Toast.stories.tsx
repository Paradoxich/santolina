import type { Meta, StoryObj } from '@storybook/react'
import { Toast } from '../components/Toast'

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'positive', 'warning', 'critical'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Toast>

export const Neutral: Story = {
  args: {
    tone: 'neutral',
    message: 'Removed from your planned list.',
    actions: [{ label: 'Undo', onClick: () => {} }],
  },
}

export const Positive: Story = {
  args: {
    tone: 'positive',
    message: 'Entry added to your journal.',
  },
}

export const Warning: Story = {
  args: {
    tone: 'warning',
    message: 'Frost expected this week.',
  },
}

export const Critical: Story = {
  args: {
    tone: 'critical',
    message: 'Could not save your note.',
  },
}
