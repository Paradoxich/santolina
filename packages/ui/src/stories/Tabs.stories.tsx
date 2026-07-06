import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Tabs } from '../components/Tabs'

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Tabs>

const items = [
  { value: 'growing', label: 'Growing', count: 12 },
  { value: 'planned', label: 'Planned', count: 4 },
]

function InteractiveTabs() {
  const [value, setValue] = useState('growing')
  return <Tabs items={items} value={value} onChange={setValue} />
}

export const Default: Story = {
  render: () => <InteractiveTabs />,
}

export const WithoutCounts: Story = {
  render: () => (
    <Tabs
      items={[
        { value: 'one', label: 'Overview' },
        { value: 'two', label: 'Details' },
      ]}
      value="one"
    />
  ),
}
