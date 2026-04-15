import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from '../components/Badge'

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'error', 'info'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: { variant: 'default', children: 'Default' },
}

export const Success: Story = {
  args: { variant: 'success', children: 'Healthy' },
}

export const Warning: Story = {
  args: { variant: 'warning', children: 'Needs water' },
}

export const Error: Story = {
  args: { variant: 'error', children: 'Critical' },
}

export const Info: Story = {
  args: { variant: 'info', children: 'New arrival' },
}
