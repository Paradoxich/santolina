import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardHeader, CardBody, CardFooter } from '../components/Card'
import { Button } from '../components/Button'

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card style={{ width: 320 }}>
      <CardHeader>
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          Monstera Deliciosa
        </h3>
      </CardHeader>
      <CardBody>
        <p style={{ margin: 0, color: 'var(--color-neutral-600)' }}>
          Tropical plant with large, glossy leaves. Thrives in indirect light.
        </p>
      </CardBody>
      <CardFooter>
        <Button size="sm" variant="secondary">
          View care guide
        </Button>
      </CardFooter>
    </Card>
  ),
}

export const Simple: Story = {
  render: () => (
    <Card style={{ width: 280 }}>
      <CardBody>
        <p style={{ margin: 0 }}>A simple card with no header or footer.</p>
      </CardBody>
    </Card>
  ),
}
