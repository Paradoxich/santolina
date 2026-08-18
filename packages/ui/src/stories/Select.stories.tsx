import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Select, type SelectOption } from '../components/Select'

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A value picker: a field-shaped trigger opening a listbox. Use this — not Menu — whenever the control holds and displays a value. Menu is for actions.',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof Select>

const PLANTS: SelectOption[] = [
  { value: 'garden', label: 'Your garden' },
  { value: 'jasmine', label: 'Common jasmine' },
  { value: 'stipa', label: 'Stipa gigantea' },
  { value: 'chasteberry', label: 'Chasteberry' },
  { value: 'gone', label: 'No longer growing', disabled: true },
]

/** Storybook args cannot hold state, so every story drives a real one. */
function Demo(props: Partial<React.ComponentProps<typeof Select>>) {
  const [value, setValue] = useState<string | null>(
    props.value === undefined ? 'garden' : props.value
  )
  return (
    <div className="w-[320px]">
      <Select
        label="What is this about"
        options={PLANTS}
        {...props}
        value={value}
        onChange={setValue}
      />
    </div>
  )
}

export const Default: Story = { render: () => <Demo /> }

export const Empty: Story = {
  render: () => <Demo value={null} placeholder="Choose a plant" />,
}

export const WithHelperText: Story = {
  render: () => (
    <Demo helperText="Notes on a plant show on that plant's page." />
  ),
}

export const WithError: Story = {
  render: () => (
    <Demo value={null} errorMessage="Pick what this note is about." />
  ),
}

export const Disabled: Story = { render: () => <Demo disabled /> }

export const Sizes: Story = {
  render: () => (
    <div className="flex w-[320px] flex-col gap-4">
      <Demo label="Medium — the default" size="md" />
      <Demo label="Large" size="lg" />
    </div>
  ),
}
