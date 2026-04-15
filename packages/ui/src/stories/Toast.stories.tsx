import type { Meta, StoryObj } from '@storybook/react'
import { Toast } from '../components/Toast'

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'error'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Toast>

export const Default: Story = {
  args: {
    variant: 'default',
    title: 'Notification',
    description: 'Your plant has been updated.',
  },
}

export const Success: Story = {
  args: {
    variant: 'success',
    title: 'Success',
    description: 'Plant watered successfully!',
  },
}

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: 'Heads up',
    description: 'Your Cactus needs water in 2 days.',
  },
}

export const Error: Story = {
  args: {
    variant: 'error',
    title: 'Error',
    description: 'Failed to save your plant data.',
  },
}
