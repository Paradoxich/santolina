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
  args: { label: 'Width', value: '80 cm' },
}

export const List: Story = {
  render: () => (
    <div style={{ maxWidth: 400 }}>
      <DetailRow label="Material" value="Solid oak" />
      <DetailRow label="Width" value="80 cm" />
      <DetailRow label="Finish" value="Natural oil" />
      <DetailRow label="Made in" value="Copenhagen" />
    </div>
  ),
}

/** Narrow label column for timeline-style lists of short stage labels. */
export const Timeline: Story = {
  render: () => (
    <div style={{ maxWidth: 400 }}>
      <DetailRow
        labelWidth="sm"
        label="Day 1"
        value="Kickoff. Scope agreed and the first drafts shared."
      />
      <DetailRow
        labelWidth="sm"
        label="Week 2"
        value="First review. Direction locked, details still moving."
      />
      <DetailRow
        labelWidth="sm"
        label="Week 6"
        value="Handoff. Final files delivered and archived."
      />
    </div>
  ),
}
