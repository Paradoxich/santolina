import type { Meta, StoryObj } from '@storybook/react'
import { Avatar } from '../components/Avatar'

const meta: Meta<typeof Avatar> = {
  title: 'Components/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
}
export default meta
type Story = StoryObj<typeof Avatar>

export const WithInitials: Story = {
  args: { initials: 'JD', size: 'md' },
}

export const Small: Story = {
  args: { initials: 'AB', size: 'sm' },
}

export const Large: Story = {
  args: { initials: 'CL', size: 'lg' },
}

export const ExtraLarge: Story = {
  args: { initials: 'MX', size: 'xl' },
}

export const WithImage: Story = {
  args: {
    src: 'https://i.pravatar.cc/100',
    alt: 'User avatar',
    size: 'md',
  },
}
