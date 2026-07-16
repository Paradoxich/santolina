import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../components/Button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'control',
        'ghost',
        'destructive',
        'destructive-ghost',
      ],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Button>

export const Primary: Story = {
  args: { variant: 'primary', children: 'Button' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Button' },
}

export const Control: Story = {
  args: { variant: 'control', children: 'Cancel' },
}

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Button' },
}

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
}

export const DestructiveGhost: Story = {
  args: { variant: 'destructive-ghost', children: 'Reset' },
}

export const Small: Story = {
  args: { variant: 'primary', size: 'sm', children: 'Small · 32' },
}

export const Medium: Story = {
  args: { variant: 'primary', size: 'md', children: 'Medium · 40' },
}

export const Large: Story = {
  args: { variant: 'primary', size: 'lg', children: 'Large · 48' },
}

export const Loading: Story = {
  args: { variant: 'primary', isLoading: true, children: 'Loading…' },
}

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: 'Disabled' },
}
