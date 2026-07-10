import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { chapters } from '@/components/design-system/chapters'

interface ChapterPageProps {
  params: Promise<{ chapter: string }>
  searchParams: Promise<{ s?: string }>
}

export function generateStaticParams() {
  return chapters.map(({ slug }) => ({ chapter: slug }))
}

export async function generateMetadata({
  params,
}: ChapterPageProps): Promise<Metadata> {
  const { chapter } = await params
  const match = chapters.find((c) => c.slug === chapter)
  return match ? { title: `${match.label} — Design System` } : {}
}

export default async function ChapterPage({
  params,
  searchParams,
}: ChapterPageProps) {
  const { chapter } = await params
  const match = chapters.find((c) => c.slug === chapter)
  if (!match) notFound()

  const { s } = await searchParams
  const active =
    match.sections.find((sec) => sec.slug === s) ?? match.sections[0]
  if (!active) notFound()

  return <div className="flex flex-col gap-section-break">{active.content}</div>
}
