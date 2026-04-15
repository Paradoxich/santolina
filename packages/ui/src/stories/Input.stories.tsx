import type { Meta, StoryObj } from '@storybook/react'
import { Input } from '../components/Input'

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: {
    label: 'Plant name',
    placeholder: 'e.g. Monstera Deliciosa',
  },
}

export const WithHelperText: Story = {
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
    helperText: 'We will never share your email.',
  },
}

export const WithError: Story = {
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
    errorMessage: 'Please enter a valid email address.',
  },
}

export const Disabled: Story = {
  args: {
    label: 'Disabled field',
    value: 'Cannot edit this',
    disabled: true,
  },
}
