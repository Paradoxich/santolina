import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Gallery, type GalleryImage } from '../components/Gallery'

const meta: Meta<typeof Gallery> = {
  title: 'Components/Gallery',
  component: Gallery,
}
export default meta
type Story = StoryObj<typeof Gallery>

// Self-contained placeholder images (no network) at varied fills.
function swatch(label: string, w: number, h: number, fill: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${fill}'/><text x='50%' y='50%' font-family='sans-serif' font-size='${Math.round(h / 8)}' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const IMAGES: GalleryImage[] = [
  { src: swatch('1 — landscape', 1200, 800, '#4a7c59'), alt: 'Landscape 1' },
  { src: swatch('2 — portrait', 700, 1100, '#8a5a44'), alt: 'Portrait 2' },
  { src: swatch('3 — portrait', 700, 1100, '#5a6b8a'), alt: 'Portrait 3' },
  { src: swatch('4 — landscape', 1200, 800, '#6b5a4a'), alt: 'Landscape 4' },
  { src: swatch('5 — portrait', 700, 1100, '#4a6b7c'), alt: 'Portrait 5' },
  { src: swatch('6 — portrait', 700, 1100, '#7c4a5a'), alt: 'Portrait 6' },
  { src: swatch('7 — leftover', 1200, 800, '#5a7c4a'), alt: 'Leftover 7' },
]

function Harness({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
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
      <Gallery
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

export const ThreeImages: Story = {
  render: () => <Harness images={IMAGES.slice(0, 3)} />,
}
