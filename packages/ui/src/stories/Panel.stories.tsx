import type { Meta, StoryObj } from '@storybook/react'
import { Panel } from '../components/Panel'

const meta: Meta<typeof Panel> = {
  title: 'Components/Panel',
  component: Panel,
  tags: ['autodocs'],
  parameters: {
    backgrounds: { default: 'page' },
  },
}
export default meta
type Story = StoryObj<typeof Panel>

export const Default: Story = {
  args: {
    title: 'Care tips',
    meta: '4 tasks',
    children: (
      <p
        style={{
          fontSize: 'var(--font-size-body)',
          color: 'var(--color-text-body-secondary)',
        }}
      >
        Panel body content goes here.
      </p>
    ),
  },
}

export const WithoutHeader: Story = {
  args: {
    children: (
      <p
        style={{
          fontSize: 'var(--font-size-subheading)',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}
      >
        A headline-style panel with no header row.
      </p>
    ),
  },
}

export const Grid: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-section-gap)',
        maxWidth: 720,
      }}
    >
      <Panel title="My plants" meta="12 in garden">
        <p style={{ fontSize: 'var(--font-size-body)' }}>Left panel</p>
      </Panel>
      <Panel title="Weather" meta="Opatija">
        <p style={{ fontSize: 'var(--font-size-body)' }}>Right panel</p>
      </Panel>
    </div>
  ),
}
