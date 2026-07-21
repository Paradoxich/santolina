import type { Metadata } from 'next'
import Link from 'next/link'
import { DitheredImage } from '@paradoxui/ui'

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
        <div className="relative flex w-full flex-col items-start gap-8 p-6 sm:p-10 lg:flex-row lg:items-end lg:gap-5 lg:px-14 lg:py-12">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl font-semibold leading-none tracking-heading text-white md:text-display">
                Santolina
              </h1>
              <p className="max-w-3xl text-lg leading-normal text-sage-300">
                An AI-native garden planning platform that combines
                horticultural knowledge, structured plant data, and intelligent
                recommendations to help people design and manage beautiful
                outdoor spaces. Built as a monorepo alongside Paradox UI, an
                open source design system extracted from the product as it's
                built.
              </p>
            </div>
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
          </div>
          <Link
            href="/overview"
            className={`inline-flex h-14 shrink-0 items-center justify-center rounded-md border border-card bg-surface-subtle px-4 text-body text-primary transition-colors duration-normal hover:bg-white ${focusRing}`}
          >
            Check out live preview
          </Link>
        </div>
      </div>
    </main>
  )
}
