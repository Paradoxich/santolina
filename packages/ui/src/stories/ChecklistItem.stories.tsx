import type { Meta, StoryObj } from '@storybook/react'
import { ChecklistItem } from '../components/ChecklistItem'

const meta: Meta<typeof ChecklistItem> = {
  title: 'Components/ChecklistItem',
  component: ChecklistItem,
  tags: ['autodocs'],
  argTypes: {
    tone: { control: 'select', options: ['positive', 'warning'] },
  },
  decorators: [
    (Story) => (
      <ul role="list" style={{ maxWidth: 400, listStyle: 'none', padding: 0 }}>
        <Story />
      </ul>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ChecklistItem>

export const Positive: Story = {
  args: { children: 'Works with the tools you already use' },
}

export const Caution: Story = {
  args: {
    tone: 'warning',
    children: 'Needs more storage than your current plan includes',
  },
}

export const List: Story = {
  render: () => (
    <ul role="list" style={{ maxWidth: 400, listStyle: 'none', padding: 0 }}>
      <ChecklistItem>Low maintenance once set up</ChecklistItem>
      <ChecklistItem>Excellent keyboard support</ChecklistItem>
      <ChecklistItem tone="warning">
        May outgrow the free tier quickly
      </ChecklistItem>
    </ul>
  ),
}
