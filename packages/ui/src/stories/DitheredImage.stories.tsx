import type { Meta, StoryObj } from '@storybook/react'
import { DitheredImage } from '../components/DitheredImage'

// Self-contained sample (an SVG data URI) so the story needs no external asset
// and never taints the WebGL texture with a cross-origin load.
const SAMPLE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2b6e3f"/>
        <stop offset="1" stop-color="#e8c14a"/>
      </linearGradient>
    </defs>
    <rect width="800" height="1000" fill="url(#g)"/>
    <circle cx="250" cy="300" r="130" fill="#f2d24b"/>
    <circle cx="560" cy="640" r="180" fill="#7fae5a"/>
    <circle cx="380" cy="820" r="90" fill="#c9b8e0"/>
  </svg>`
)}`

const meta: Meta<typeof DitheredImage> = {
  title: 'Components/DitheredImage',
  component: DitheredImage,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'An image rendered through a WebGL dither shader with a slow Ken Burns drift and an interactive cursor lens. Hover the image to move the lens.',
      },
    },
  },
  args: {
    src: SAMPLE,
    levels: 6,
    cell: 2,
    revealRadius: 130,
    softness: 0.45,
    weight: 0.5,
    hoverMode: 'reveal',
  },
  render: (args) => (
    <div style={{ width: 360, height: 460 }}>
      <DitheredImage {...args} className="h-full w-full rounded-[16px]" />
    </div>
  ),
}
export default meta
type Story = StoryObj<typeof DitheredImage>

/** A fine grain over the real colour. Hover to reveal the clean image. */
export const Default: Story = {}

/** Fewer levels collapse the image toward posterised blocks. */
export const Posterised: Story = {
  args: { levels: 3, cell: 3 },
}

/** Spotlight lens: the image brightens and saturates under a weighted cursor. */
export const Spotlight: Story = {
  args: {
    levels: 14,
    hoverMode: 'spotlight',
    revealRadius: 100,
    softness: 0.8,
    weight: 0.5,
  },
}

/**
 * Live footage through the same shader: `videoSrc` feeds the texture a video
 * frame per tick and turns the Ken Burns orbit off (the footage moves on its
 * own). `src` remains the poster for reduced motion and failed loads. Unlike
 * the other stories this one fetches a sample video (CC0, MDN shared assets)
 * over the network — offline it degrades to the dithered poster.
 */
export const Video: Story = {
  args: {
    videoSrc: 'https://mdn.github.io/shared-assets/videos/flower.webm',
    levels: 10,
  },
}
