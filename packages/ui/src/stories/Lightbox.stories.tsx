import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Lightbox, type LightboxImage } from '../components/Lightbox'

const meta: Meta<typeof Lightbox> = {
  title: 'Components/Lightbox',
  component: Lightbox,
}
export default meta
type Story = StoryObj<typeof Lightbox>

// Self-contained placeholder images (no network) at varied aspect ratios.
function swatch(label: string, w: number, h: number, fill: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${fill}'/><text x='50%' y='50%' font-family='sans-serif' font-size='${Math.round(h / 6)}' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const IMAGES: LightboxImage[] = [
  { src: swatch('1 — wide', 1200, 700, '#4a7c59'), alt: 'Wide sample' },
  { src: swatch('2 — tall', 700, 1100, '#8a5a44'), alt: 'Tall sample' },
  { src: swatch('3 — square', 900, 900, '#5a6b8a'), alt: 'Square sample' },
]

function Harness({ images }: { images: LightboxImage[] }) {
  const [index, setIndex] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {images.map((img, i) => (
        <button
          key={img.src}
          type="button"
          onClick={() => setIndex(i)}
          style={{ padding: 0, border: 'none', cursor: 'pointer' }}
        >
          <img
            src={img.src}
            alt={img.alt}
            style={{ height: 96, borderRadius: 8, display: 'block' }}
          />
        </button>
      ))}
      <Lightbox
        images={images}
        isOpen={index !== null}
        initialIndex={index ?? 0}
        onClose={() => setIndex(null)}
      />
    </div>
  )
}

export const Default: Story = {
  render: () => <Harness images={IMAGES} />,
}

export const SingleImage: Story = {
  render: () => <Harness images={[IMAGES[0]!]} />,
}
