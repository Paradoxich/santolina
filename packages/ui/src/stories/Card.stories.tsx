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
          Field Notes
        </h3>
      </CardHeader>
      <CardBody>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          A quiet home for drafts, clippings, and half-formed ideas.
        </p>
      </CardBody>
      <CardFooter>
        <Button size="sm" variant="secondary">
          Open notebook
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
