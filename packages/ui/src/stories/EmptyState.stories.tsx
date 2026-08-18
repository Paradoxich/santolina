import type { Meta, StoryObj } from '@storybook/react'
import { EmptyState } from '../components/EmptyState'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof EmptyState>

export const Default: Story = {
  args: {
    message: 'Nothing saved yet. Items you add will show up here.',
    ctaLabel: 'Browse items',
    ctaHref: '#',
  },
}

/**
 * With no CTA the message centres, because the row's `justify-between` exists
 * to push a CTA to the far edge and there is nothing to push against. Compare
 * `Default`, where the same row keeps the message left.
 */
export const NoAction: Story = {
  args: {
    message: 'Reflections are on their way.',
  },
}

export const WithAction: Story = {
  args: {
    message: 'No results for this filter.',
    ctaLabel: 'Clear filters',
    onCtaClick: () => {},
  },
}

export const WithIllustration: Story = {
  args: {
    message: 'Nothing saved yet. Items you add will show up here.',
    ctaLabel: 'Browse items',
    ctaHref: '#',
    illustration: (
      <svg
        aria-hidden="true"
        width="96"
        height="96"
        viewBox="0 0 48 48"
        fill="none"
        className="text-secondary"
      >
        <path
          d="M10 38h10M26 38h12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M24 38V22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M24 27c-6 0-10-4-10-10 6 0 10 4 10 10Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M24 22c5 0 9-4 9-9-5 0-9 4-9 9Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
}
