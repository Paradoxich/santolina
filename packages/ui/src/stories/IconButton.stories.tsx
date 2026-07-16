import type { Meta, StoryObj } from '@storybook/react'
import { IconButton } from '../components/IconButton'

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 4h12M6.667 4V2.667a1.333 1.333 0 0 1 1.333-1.334h0a1.333 1.333 0 0 1 1.333 1.334V4M12.667 4v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const meta: Meta<typeof IconButton> = {
  title: 'Components/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'control',
        'ghost',
        'destructive',
        'destructive-ghost',
      ],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
}
export default meta
type Story = StoryObj<typeof IconButton>

export const Primary: Story = {
  args: {
    variant: 'primary',
    'aria-label': 'Add entry',
    children: <TrashIcon />,
  },
}

export const Control: Story = {
  args: {
    variant: 'control',
    'aria-label': 'Remove from garden',
    children: <TrashIcon />,
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    'aria-label': 'Clear diary',
    children: <TrashIcon />,
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    'aria-label': 'Delete',
    children: <TrashIcon />,
  },
}

export const DestructiveGhost: Story = {
  args: {
    variant: 'destructive-ghost',
    'aria-label': 'Delete',
    children: <TrashIcon />,
  },
}

export const Small: Story = {
  args: {
    variant: 'control',
    size: 'sm',
    'aria-label': 'Small',
    children: <TrashIcon />,
  },
}

export const Medium: Story = {
  args: {
    variant: 'control',
    size: 'md',
    'aria-label': 'Medium',
    children: <TrashIcon />,
  },
}

export const Large: Story = {
  args: {
    variant: 'control',
    size: 'lg',
    'aria-label': 'Large',
    children: <TrashIcon />,
  },
}

export const Loading: Story = {
  args: {
    variant: 'primary',
    isLoading: true,
    'aria-label': 'Loading',
    children: <TrashIcon />,
  },
}

export const Disabled: Story = {
  args: {
    variant: 'control',
    disabled: true,
    'aria-label': 'Disabled',
    children: <TrashIcon />,
  },
}
