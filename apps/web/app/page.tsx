import type { Metadata } from 'next'
import Link from 'next/link'
import { DitheredImage, Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'

export const metadata: Metadata = {
  title: 'Santolina',
  description:
    'An AI-native garden planning platform that combines horticultural knowledge, structured plant data, and intelligent recommendations to help people design and manage beautiful outdoor spaces.',
}

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

// On hover the rule brightens and drops 2px away from the text.
const heroLink = `rounded-xs text-white underline decoration-sage-600 underline-offset-4 transition-all duration-normal ease-out hover:decoration-white hover:underline-offset-[6px] motion-reduce:transition-none ${focusRing}`

export default function LandingPage() {
  return (
    <main className="h-dvh bg-surface-page p-3">
      <div className="relative flex h-full flex-col justify-end overflow-hidden rounded-card-tile bg-surface-inverse">
        {/* The still is the poster: reduced motion, a refused autoplay, or a
            failed load all fall back to it, dithered. */}
        <DitheredImage
          src="/textures/signup-hero-landscape.jpg"
          videoSrc="/textures/landing-hero.mp4"
          className="absolute inset-0"
          levels={12}
          cell={2}
          revealRadius={0}
        />
        <div className="absolute inset-0 bg-[image:var(--landing-scrim)]" />
        <div className="relative flex w-full flex-col gap-8 p-6 sm:p-10 lg:px-14 lg:py-12">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="text-4xl font-semibold leading-none tracking-heading text-white md:text-display">
              Santolina
            </h1>
            <p className="max-w-3xl text-lg leading-normal text-sage-300">
              An AI-native garden planning platform that combines horticultural
              knowledge, structured plant data, and intelligent recommendations
              to help people design and manage beautiful outdoor spaces. Built
              as a monorepo alongside Paradox UI, an open source design system
              extracted from the product as it's built.
            </p>
          </div>
          {/* Links and CTA share one row so their centres line up; they stack
              below the sm breakpoint, where the button goes full width. */}
          <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex gap-5 text-lg leading-normal">
              <a
                href="https://paradoxich.substack.com"
                target="_blank"
                rel="noopener noreferrer"
                className={heroLink}
              >
                Substack
              </a>
              <a
                href="https://github.com/Paradoxich/santolina"
                target="_blank"
                rel="noopener noreferrer"
                className={heroLink}
              >
                GitHub
              </a>
            </div>
            <Link
              href="/overview"
              className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md border border-card bg-surface-subtle px-4 text-body text-primary transition-colors duration-normal hover:bg-white ${focusRing}`}
            >
              Live preview
              <Icon src={icons.arrowRight} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
