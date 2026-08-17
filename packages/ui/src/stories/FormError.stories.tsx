import type { Meta, StoryObj } from '@storybook/react'
import { FormError } from '../components/FormError'
import { Input } from '../components/Input'

const meta: Meta<typeof FormError> = {
  title: 'Components/FormError',
  component: FormError,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The one way a form failure is spoken. `align="start"` sits under the field it is about and is tied to it by id; `align="center"` sits in a card\'s single failure slot, where the fault is the request rather than any one field. Input renders its own errorMessage through this, so a labelled field and a bare field fail in the same voice.',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof FormError>

export const UnderAField: Story = {
  args: {
    id: 'email-error',
    children: 'That does not look like an email address.',
  },
}

export const InACardSlot: Story = {
  args: {
    align: 'center',
    children: 'We could not send the link. Check the address and try again.',
  },
  decorators: [
    (Story) => (
      <div className="w-80 rounded-md bg-surface-card p-4">
        <Story />
      </div>
    ),
  ],
}

// The pairing that matters: a field-level message must look the same whether
// the field carries a label or is a bare pill wired up by hand.
export const WiredToAnInput: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <Input
        label="Email"
        defaultValue="ana@"
        errorMessage="That does not look like an email address."
      />
      <div className="flex flex-col gap-2">
        <input
          id="bare-email"
          defaultValue="ana@"
          aria-invalid
          aria-describedby="bare-email-error"
          className="h-12 rounded-md bg-white px-3 text-body-small text-primary ring-2 ring-critical focus:outline-none"
        />
        <FormError id="bare-email-error">
          That does not look like an email address.
        </FormError>
      </div>
    </div>
  ),
}
