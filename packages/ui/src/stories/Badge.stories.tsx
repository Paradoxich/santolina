import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from '../components/Badge'

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'accent'],
    },
    tone: {
      control: 'select',
      options: ['positive', 'warning', 'critical'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: { variant: 'default', children: 'Default' },
}

export const Accent: Story = {
  args: { variant: 'accent', children: 'Accent' },
}

export const Positive: Story = {
  args: { tone: 'positive', children: 'Healthy' },
}

export const Warning: Story = {
  args: { tone: 'warning', children: 'Needs water' },
}

export const Critical: Story = {
  args: { tone: 'critical', children: 'Critical' },
}
