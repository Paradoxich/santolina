import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from '../components/Textarea'

const meta: Meta<typeof Textarea> = {
  title: 'Components/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof Textarea>

export const Default: Story = {
  args: { placeholder: 'What happened in your garden?' },
}

export const WithLabel: Story = {
  args: {
    label: 'Note',
    placeholder: 'What happened in your garden?',
    helperText: 'Dated automatically. Nothing here is required.',
  },
}

export const WithError: Story = {
  args: {
    label: 'Note',
    placeholder: 'What happened in your garden?',
    errorMessage: 'Write a note or attach a photo.',
  },
}

export const Disabled: Story = {
  args: { value: 'Read only once a plant leaves the garden.', disabled: true },
}
