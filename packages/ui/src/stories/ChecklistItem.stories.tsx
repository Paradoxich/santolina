import type { Meta, StoryObj } from '@storybook/react'
import { ChecklistItem } from '../components/ChecklistItem'

const meta: Meta<typeof ChecklistItem> = {
  title: 'Components/ChecklistItem',
  component: ChecklistItem,
  tags: ['autodocs'],
  argTypes: {
    tone: { control: 'select', options: ['positive', 'caution'] },
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
  args: { children: 'Matches your sunny Mediterranean conditions' },
}

export const Caution: Story = {
  args: {
    tone: 'caution',
    children: 'Needs more sun than your garden currently gets',
  },
}

export const List: Story = {
  render: () => (
    <ul role="list" style={{ maxWidth: 400, listStyle: 'none', padding: 0 }}>
      <ChecklistItem>Low maintenance once established</ChecklistItem>
      <ChecklistItem>Excellent pollinator support</ChecklistItem>
      <ChecklistItem tone="caution">
        May outgrow a balcony or container
      </ChecklistItem>
    </ul>
  ),
}
