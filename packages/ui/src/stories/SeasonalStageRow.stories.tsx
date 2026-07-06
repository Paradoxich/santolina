import type { Meta, StoryObj } from '@storybook/react'
import { SeasonalStageRow } from '../components/SeasonalStageRow'

const meta: Meta<typeof SeasonalStageRow> = {
  title: 'Components/SeasonalStageRow',
  component: SeasonalStageRow,
  tags: ['autodocs'],
}
export default meta
type Story = StoryObj<typeof SeasonalStageRow>

export const Default: Story = {
  args: {
    stage: 'Summer',
    children:
      'Peak flowering season. Regular deadheading encourages repeat blooming through warm months.',
  },
}

export const List: Story = {
  render: () => (
    <div style={{ maxWidth: 400 }}>
      <SeasonalStageRow stage="Early Spring">
        Fresh basal growth emerges. Foliage begins forming dense clumps.
      </SeasonalStageRow>
      <SeasonalStageRow stage="Summer">
        Peak flowering season. Regular deadheading encourages repeat blooming.
      </SeasonalStageRow>
      <SeasonalStageRow stage="Winter">
        Dormant. Structure disappears almost entirely until spring regrowth.
      </SeasonalStageRow>
    </div>
  ),
}
