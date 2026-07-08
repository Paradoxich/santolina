import { getLatestMergedPR } from '@/lib/latest-pr'
import { formatRelativeTime } from '@/lib/utils'
import styles from './LatestPrLine.module.css'

/** Quiet "actively being built" signal — the most recently merged PR, or nothing at all. */
export async function LatestPrLine() {
  const pr = await getLatestMergedPR()
  if (!pr) return null

  return (
    <a
      className={styles.chip}
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg
        className={styles.icon}
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
      </svg>
      <span className={styles.text}>
        {pr.title} — {formatRelativeTime(pr.mergedAt)}
      </span>
    </a>
  )
}

export default LatestPrLine
