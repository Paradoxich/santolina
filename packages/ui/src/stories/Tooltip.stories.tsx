import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip } from '../components/Tooltip'
import { Button } from '../components/Button'

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  argTypes: {
    position: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{ padding: '80px', display: 'flex', justifyContent: 'center' }}
      >
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof Tooltip>

export const Top: Story = {
  render: () => (
    <Tooltip content="Hover me!" position="top">
      <Button variant="secondary">Hover for tooltip (top)</Button>
    </Tooltip>
  ),
}

export const Bottom: Story = {
  render: () => (
    <Tooltip content="Bottom tooltip" position="bottom">
      <Button variant="secondary">Hover (bottom)</Button>
    </Tooltip>
  ),
}

export const Left: Story = {
  render: () => (
    <Tooltip content="Left tooltip" position="left">
      <Button variant="secondary">Hover (left)</Button>
    </Tooltip>
  ),
}

export const Right: Story = {
  render: () => (
    <Tooltip content="Right tooltip" position="right">
      <Button variant="secondary">Hover (right)</Button>
    </Tooltip>
  ),
}
