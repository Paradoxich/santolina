/**
 * Attribution for a curated hero image.
 *
 * Snake_case to match the jsonb stored in plants.image_attribution directly —
 * no conversion at the DB boundary. Null for Trefle/PlantNet picks (which we
 * don't credit); populated for Wikimedia Commons photos, whose CC-BY / CC-BY-SA
 * licences require a visible credit.
 */
export interface ImageAttribution {
  artist: string | null
  license: string | null
  license_url: string | null
  source_url: string | null
}

/**
 * Whether a Commons licence string is safe to use in a commercial product.
 *
 * Santolina is a product (santolina.app), so the usable set is the permissive
 * commercial-OK licences: public domain, CC0, and the attribution licences
 * CC-BY and CC-BY-SA (any version). Excluded:
 *   - NonCommercial (`-NC`) and NoDerivatives (`-ND`) — bar or restrict our use.
 *   - GFDL / GNU / other copyleft *documentation* licences — technically require
 *     reproducing the full licence text, impractical for a photo credit, and a
 *     GFDL-only file is a genuine commercial-use risk.
 * Wikimedia never hosts NC images, but a file can be GFDL-only (e.g. older
 * uploads), so this guard is what keeps one out of the catalog.
 */
export function isCommercialSafeLicense(license: string | null): boolean {
  if (!license) return false
  const l = license.toLowerCase()
  if (l.includes('-nc') || l.includes('-nd') || l.includes('noncommercial')) {
    return false
  }
  if (l.includes('public domain') || l.includes('cc0')) return true
  // "cc by" also matches "cc by-sa"; GFDL / GPL fall through to false.
  return l.includes('cc by')
}

/**
 * A one-line credit for the detail drawer, e.g. "Photo: HitroMilanese, CC BY-SA
 * 3.0". Returns null when there is nothing meaningful to credit, so callers can
 * simply skip rendering. Links are the caller's job — this is the text.
 */
export function creditLine(
  a: ImageAttribution | null | undefined
): string | null {
  if (!a) return null
  const parts = [a.artist, a.license].filter((p): p is string =>
    Boolean(p && p.trim())
  )
  if (parts.length === 0) return null
  return `Photo: ${parts.join(', ')}`
}
