import type { Meta, StoryObj } from '@storybook/react'
import { StatCard } from '../components/StatCard'

const meta: Meta<typeof StatCard> = {
  title: 'Components/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'soft', 'warning', 'positive'],
    },
  },
}
export default meta
type Story = StoryObj<typeof StatCard>

const dropIcon = (
  <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
    <path
      d="M8 2C8 2 4 7 4 10a4 4 0 108 0c0-3-4-8-4-8z"
      stroke="currentColor"
      strokeWidth="1.25"
    />
  </svg>
)

export const Default: Story = {
  args: {
    label: 'Water',
    icon: dropIcon,
    children:
      'Moderate watering while establishing. Drought tolerant once mature.',
  },
}

export const Caution: Story = {
  args: {
    tone: 'warning',
    label: 'Common issues',
    children:
      'Can become floppy in overly rich soil or too much shade. Poor drainage may cause crown rot during winter.',
  },
}

export const Positive: Story = {
  args: {
    tone: 'positive',
    label: 'Environment benefits',
    children:
      'Highly attractive to bees and other pollinators during peak bloom weeks.',
  },
}

export const Grid: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-inline-gap)',
        maxWidth: 400,
      }}
    >
      <StatCard label="Water" icon={dropIcon}>
        Moderate watering while establishing.
      </StatCard>
      <StatCard label="Light" icon={dropIcon}>
        Performs best in full sun.
      </StatCard>
      <StatCard
        tone="warning"
        label="Common issues"
        style={{ gridColumn: 'span 2' }}
      >
        Can become floppy in overly rich soil or too much shade.
      </StatCard>
    </div>
  ),
}
