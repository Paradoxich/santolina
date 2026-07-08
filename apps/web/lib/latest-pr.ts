// Client-safe — hits GitHub's public API directly, no auth/secrets involved.

export interface LatestPr {
  title: string
  url: string
  mergedAt: string
}

const PULLS_URL =
  'https://api.github.com/repos/Paradoxich/santolina/pulls?state=closed&sort=updated&direction=desc&per_page=10'

interface GithubPullResponse {
  title: string
  html_url: string
  merged_at: string | null
}

/**
 * Fetches the most recently merged PR for the landing page's "Latest" line.
 * Cached for an hour via `next.revalidate` — GitHub's unauthenticated rate
 * limit is 60 requests/hour per IP, so this must never be fetched live per
 * page view. Fails silently (returns null) on any error — a closed-but-not-
 * merged PR, a rate limit, a network error — so the caller can just skip
 * rendering the line rather than showing a broken state.
 */
export async function getLatestMergedPR(): Promise<LatestPr | null> {
  try {
    const res = await fetch(PULLS_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'santolina-app',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) return null

    const pulls = (await res.json()) as GithubPullResponse[]
    const merged = pulls.find(
      (pr): pr is GithubPullResponse & { merged_at: string } =>
        pr.merged_at != null
    )
    if (!merged) return null

    return {
      title: merged.title,
      url: merged.html_url,
      mergedAt: merged.merged_at,
    }
  } catch {
    return null
  }
}
