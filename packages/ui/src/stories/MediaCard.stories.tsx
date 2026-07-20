import type { Meta, StoryObj } from '@storybook/react'
import { MediaCard } from '../components/MediaCard'

const placeholderImage = (
  <div
    style={{
      width: '100%',
      height: '100%',
      background: 'var(--color-sage-300)',
    }}
  />
)

const meta: Meta<typeof MediaCard> = {
  title: 'Components/MediaCard',
  component: MediaCard,
  tags: ['autodocs'],
  parameters: {
    backgrounds: { default: 'page' },
  },
}
export default meta
type Story = StoryObj<typeof MediaCard>

export const Default: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 162,
    title: 'Kotor',
    subtitle: 'Bay of Kotor, Montenegro',
    body: 'Steep alleys, quiet courtyards, and the best light an hour before sunset.',
  },
}

export const WithBadgeAndFooter: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 200,
    title: 'Kotor',
    titleAdornment: (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-accent-muted)',
          color: 'var(--color-accent)',
          fontSize: 'var(--font-size-label)',
          padding: '2px 8px',
        }}
      >
        new
      </span>
    ),
    body: '❋ Saved as a highlight in your latest collection.',
  },
}

export const Dashed: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 148,
    title: 'Kotor',
    subtitle: 'Old town · Best in May',
    body: 'Steep alleys, quiet courtyards, and the best light an hour before sunset.',
    border: 'dashed',
    footer: (
      <button
        type="button"
        style={{
          flex: 1,
          height: 32,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface-control)',
        }}
      >
        Add to trip
      </button>
    ),
  },
}

export const Clickable: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 162,
    title: 'Kotor',
    subtitle: 'Bay of Kotor, Montenegro',
    body: 'Steep alleys, quiet courtyards, and the best light an hour before sunset.',
    as: 'button',
  },
}
