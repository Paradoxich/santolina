import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { SwatchChip } from '../components/SwatchChip'

const meta: Meta<typeof SwatchChip> = {
  title: 'Components/SwatchChip',
  component: SwatchChip,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof SwatchChip>

export const Default: Story = {
  args: { color: '#7c4d9b', label: 'Purple' },
}

export const Selected: Story = {
  args: { color: '#7c4d9b', label: 'Purple', selected: true },
}

export const LightSwatch: Story = {
  args: { color: '#f7f5ee', label: 'Off white' },
}

function SwatchRowStory() {
  const swatches = [
    { color: '#f7f5ee', label: 'Off white' },
    { color: '#f0ca3c', label: 'Gold' },
    { color: '#c03a2b', label: 'Brick' },
    { color: '#7c4d9b', label: 'Plum' },
    { color: '#4f74bd', label: 'Slate blue' },
    { color: '#97b060', label: 'Moss' },
  ]
  const [selected, setSelected] = useState<string[]>(['Gold'])
  return (
    <div className="flex flex-wrap gap-2">
      {swatches.map((s) => (
        <SwatchChip
          key={s.label}
          color={s.color}
          label={s.label}
          selected={selected.includes(s.label)}
          onClick={() =>
            setSelected((prev) =>
              prev.includes(s.label)
                ? prev.filter((l) => l !== s.label)
                : [...prev, s.label]
            )
          }
        />
      ))}
    </div>
  )
}

export const SelectableRow: Story = {
  render: () => <SwatchRowStory />,
}
