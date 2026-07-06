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
