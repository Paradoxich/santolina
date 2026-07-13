import type { Meta, StoryObj } from '@storybook/react'
import { SearchField } from '../components/SearchField'

const meta: Meta<typeof SearchField> = {
  title: 'Components/SearchField',
  component: SearchField,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof SearchField>

export const Default: Story = {
  args: { placeholder: 'Search plants...' },
}

export const WithLabel: Story = {
  args: { placeholder: 'Search...', label: 'Search the catalog' },
}

export const WithTrailingAction: Story = {
  args: {
    placeholder: 'Search...',
    trailingAction: (
      <button
        type="button"
        aria-label="Open filters"
        className="flex size-8 items-center justify-center rounded-full transition-colors duration-normal hover:bg-surface-overlay"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-secondary"
        >
          <path
            d="M2 4h12M4.5 8h7M7 12h2"
            stroke="currentColor"
            strokeWidth="1.33333"
            strokeLinecap="round"
          />
        </svg>
      </button>
    ),
  },
}
