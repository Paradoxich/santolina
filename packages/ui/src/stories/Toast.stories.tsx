import type { Meta, StoryObj } from '@storybook/react'
import { Toast } from '../components/Toast'

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: 'select',
      options: ['default', 'positive', 'warning', 'critical'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Toast>

export const Default: Story = {
  args: {
    tone: 'default',
    title: 'Notification',
    description: 'Your plant has been updated.',
  },
}

export const Positive: Story = {
  args: {
    tone: 'positive',
    title: 'Positive',
    description: 'Plant watered successfully!',
  },
}

export const Warning: Story = {
  args: {
    tone: 'warning',
    title: 'Heads up',
    description: 'Your Cactus needs water in 2 days.',
  },
}

export const Critical: Story = {
  args: {
    tone: 'critical',
    title: 'Critical',
    description: 'Failed to save your plant data.',
  },
}
