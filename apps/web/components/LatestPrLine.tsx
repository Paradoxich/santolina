import { getLatestMergedPR } from '@/lib/latest-pr'
import { formatRelativeTime } from '@/lib/utils'
import styles from './LatestPrLine.module.css'

/** Quiet "actively being built" signal — the most recently merged PR, or nothing at all. */
export async function LatestPrLine() {
  const pr = await getLatestMergedPR()
  if (!pr) return null

  return (
    <p className={styles.line}>
      Latest:{' '}
      <a href={pr.url} target="_blank" rel="noopener noreferrer">
        {pr.title}
      </a>{' '}
      — {formatRelativeTime(pr.mergedAt)}
    </p>
  )
}

export default LatestPrLine
