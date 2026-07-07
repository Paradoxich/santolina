import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from '../components/Badge'

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'positive', 'warning', 'critical'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: { variant: 'default', children: 'Default' },
}

export const Positive: Story = {
  args: { variant: 'positive', children: 'Healthy' },
}

export const Warning: Story = {
  args: { variant: 'warning', children: 'Needs water' },
}

export const Critical: Story = {
  args: { variant: 'critical', children: 'Critical' },
}
