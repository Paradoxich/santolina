import type { Meta, StoryObj } from '@storybook/react'
import { Thumbnail } from '../components/Thumbnail'

const meta: Meta<typeof Thumbnail> = {
  title: 'Components/Thumbnail',
  component: Thumbnail,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Thumbnail>

const src = 'https://picsum.photos/seed/coast/200/300'

export const Default: Story = {
  render: () => (
    <div style={{ height: 105, width: 90, display: 'flex' }}>
      <Thumbnail src={src} label="Lisbon" />
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
      <Thumbnail src={src} label="Trieste" />
      <Thumbnail src={src} label="Split" />
      <Thumbnail src={src} label="Kotor" />
      <Thumbnail src={src} label="Lisbon" />
    </div>
  ),
}
