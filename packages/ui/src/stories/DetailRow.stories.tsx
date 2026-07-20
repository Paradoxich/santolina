import type { Meta, StoryObj } from '@storybook/react'
import { DetailRow } from '../components/DetailRow'

const meta: Meta<typeof DetailRow> = {
  title: 'Components/DetailRow',
  component: DetailRow,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof DetailRow>

export const Default: Story = {
  args: { label: 'Height', value: '30–90 cm' },
}

export const List: Story = {
  render: () => (
    <div style={{ maxWidth: 400 }}>
      <DetailRow label="Plant type" value="Herbaceous perennial" />
      <DetailRow label="Height" value="30–90 cm" />
      <DetailRow label="Exposure" value="Full sun" />
      <DetailRow label="Family" value="Lamiaceae" />
    </div>
  ),
}

/** Narrow label column for timeline-style lists of short stage labels. */
export const Timeline: Story = {
  render: () => (
    <div style={{ maxWidth: 400 }}>
      <DetailRow
        labelWidth="sm"
        label="Spring"
        value="Fresh growth emerges and clumps begin to form."
      />
      <DetailRow
        labelWidth="sm"
        label="Summer"
        value="Peak season. Regular attention keeps things going."
      />
      <DetailRow
        labelWidth="sm"
        label="Winter"
        value="Dormant. Structure disappears until regrowth."
      />
    </div>
  ),
}
