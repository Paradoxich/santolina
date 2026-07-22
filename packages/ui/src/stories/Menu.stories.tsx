import type { Meta, StoryObj } from '@storybook/react'
import { Menu } from '../components/Menu'

const meta: Meta<typeof Menu> = {
  title: 'Components/Menu',
  component: Menu,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Menu>

const chevron = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    className="text-secondary"
  >
    <path
      d="M4 6l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const Default: Story = {
  args: {
    label: 'Item actions',
    trigger: chevron,
    triggerClassName:
      'flex size-8 items-center justify-center rounded-full transition-colors duration-normal hover:bg-surface-overlay',
    items: [
      { label: 'Copy text', onSelect: () => {} },
      { label: 'Duplicate', onSelect: () => {} },
      { label: 'Delete', onSelect: () => {}, tone: 'critical' },
    ],
  },
}

export const WithDisabledItem: Story = {
  args: {
    label: 'Item actions',
    trigger: chevron,
    triggerClassName:
      'flex size-8 items-center justify-center rounded-full transition-colors duration-normal hover:bg-surface-overlay',
    items: [
      { label: 'Copy text', onSelect: () => {} },
      { label: 'Edit', onSelect: () => {}, disabled: true },
      { label: 'Delete', onSelect: () => {}, tone: 'critical' },
    ],
  },
}

/** Hover-opened, left-aligned, stretched to a full-width row trigger. */
export const OpensOnHover: Story = {
  args: {
    label: 'Your account',
    openOnHover: true,
    align: 'start',
    className: 'w-[220px]',
    trigger: (
      <>
        <span className="flex-1 text-left text-body text-primary">
          Ana Beverin
        </span>
        {chevron}
      </>
    ),
    triggerClassName:
      'flex w-full items-center gap-inline-gap rounded-md px-row-gap py-item-gap transition-colors duration-normal hover:bg-surface-overlay',
    items: [
      { label: 'Settings', onSelect: () => {} },
      { label: 'Log out', onSelect: () => {} },
    ],
  },
}

export const OpensUpward: Story = {
  args: {
    label: 'Item actions',
    trigger: chevron,
    position: 'top',
    triggerClassName:
      'flex size-8 items-center justify-center rounded-full transition-colors duration-normal hover:bg-surface-overlay',
    items: [
      { label: 'Copy text', onSelect: () => {} },
      { label: 'Delete', onSelect: () => {}, tone: 'critical' },
    ],
  },
}
