import type { Meta, StoryObj } from '@storybook/react'
import { Chip } from '../components/Chip'

const meta: Meta<typeof Chip> = {
  title: 'Components/Chip',
  component: Chip,
  tags: ['autodocs'],
  argTypes: {
    selected: { control: 'boolean' },
  },
}
export default meta
type Story = StoryObj<typeof Chip>

export const Default: Story = {
  args: { children: 'Blooming' },
}

export const Selected: Story = {
  args: { selected: true, children: 'All' },
}

export const Group: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--space-inline-gap)' }}>
      <Chip selected>All</Chip>
      <Chip>Blooming</Chip>
      <Chip>Pre-bloom</Chip>
      <Chip>Resting</Chip>
      <Chip>Done</Chip>
    </div>
  ),
}
