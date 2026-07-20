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
    label: 'Humidity',
    icon: dropIcon,
    children:
      'Comfortable range through the afternoon. Expect a drier evening.',
  },
}

export const Caution: Story = {
  args: {
    tone: 'warning',
    label: 'Wind',
    children:
      'Strong gusts expected after sunset. Secure anything loose on the balcony.',
  },
}

export const Positive: Story = {
  args: {
    tone: 'positive',
    label: 'Air quality',
    children:
      'Clear and clean all week. A good stretch for keeping the windows open.',
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
      <StatCard label="Humidity" icon={dropIcon}>
        Comfortable range through the afternoon.
      </StatCard>
      <StatCard label="Light" icon={dropIcon}>
        Golden hour starts around seven.
      </StatCard>
      <StatCard tone="warning" label="Wind" style={{ gridColumn: 'span 2' }}>
        Strong gusts expected after sunset.
      </StatCard>
    </div>
  ),
}
