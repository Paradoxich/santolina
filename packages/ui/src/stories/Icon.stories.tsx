import type { Meta, StoryObj } from '@storybook/react'
import { Icon } from '../components/Icon'

const meta: Meta<typeof Icon> = {
  title: 'Components/Icon',
  component: Icon,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Icon>

const squareSrc =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><rect width="14" height="14" rx="2" fill="#386b41"/></svg>'
  )

/** A deliberately non-square viewBox — mirrors the real bug where mismatched
 * icon proportions distorted or overflowed a fixed-size box. */
const tallSrc =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg viewBox="0 0 12 18" xmlns="http://www.w3.org/2000/svg"><rect width="12" height="18" rx="2" fill="#2b6e3f"/></svg>'
  )

export const Default: Story = {
  args: { src: squareSrc },
}

export const CustomSize: Story = {
  args: { src: squareSrc, size: 32 },
}

export const MismatchedAspectRatio: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-item-gap)',
        alignItems: 'center',
      }}
    >
      <Icon src={squareSrc} />
      <Icon src={tallSrc} />
    </div>
  ),
}
