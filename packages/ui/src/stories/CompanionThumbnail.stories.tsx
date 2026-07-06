import type { Meta, StoryObj } from '@storybook/react'
import { CompanionThumbnail } from '../components/CompanionThumbnail'

const meta: Meta<typeof CompanionThumbnail> = {
  title: 'Components/CompanionThumbnail',
  component: CompanionThumbnail,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof CompanionThumbnail>

const src = 'https://picsum.photos/seed/plant/200/300'

export const Default: Story = {
  render: () => (
    <div style={{ height: 105, width: 90, display: 'flex' }}>
      <CompanionThumbnail src={src} label="Lavender" />
    </div>
  ),
}

export const Row: Story = {
  render: () => (
    <div
      style={{
        height: 105,
        maxWidth: 400,
        display: 'flex',
        gap: 'var(--space-tight-gap)',
      }}
    >
      <CompanionThumbnail src={src} label="Santolina" />
      <CompanionThumbnail src={src} label="Salvia" />
      <CompanionThumbnail src={src} label="Rosemary" />
      <CompanionThumbnail src={src} label="Lavender" />
    </div>
  ),
}
