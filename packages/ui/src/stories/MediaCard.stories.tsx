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
    title: 'Lavender',
    subtitle: 'Lavandula angustifolia',
    body: 'A fragrant, drought-tolerant perennial that draws pollinators all summer.',
  },
}

export const WithBadgeAndFooter: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 200,
    title: 'Lavender',
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
        blooming
      </span>
    ),
    body: '❋ Deadhead spent blooms to encourage a second flush.',
  },
}

export const Dashed: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 148,
    title: 'Lavender',
    subtitle: 'Part shade · Aug–Oct',
    body: 'A fragrant, drought-tolerant perennial that draws pollinators all summer.',
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
        Mark as planted
      </button>
    ),
  },
}

export const Clickable: Story = {
  args: {
    image: placeholderImage,
    imageHeight: 162,
    title: 'Lavender',
    subtitle: 'Lavandula angustifolia',
    body: 'A fragrant, drought-tolerant perennial that draws pollinators all summer.',
    as: 'button',
  },
}
