import { TokenTierBlock } from '../TokenTable'
import { allTokens } from '../token-data'
import { Section, type Chapter } from '../chapter-helpers'

// One tab per tier. Both the tab label and the section heading drop the
// "Tier N —" prefix; the tier's own one-line intro from token-data is the
// single description.
const tierSections = allTokens.map((tier, i) => {
  const label = tier.tier.replace(/^Tier \d+ — /, '')
  return {
    slug: `tier-${i + 1}`,
    label,
    content: (
      <Section title={label} intro={tier.intro}>
        <TokenTierBlock tier={tier} />
      </Section>
    ),
  }
})

export const tokensChapter: Chapter = {
  slug: 'tokens',
  label: 'All tokens',
  sections: tierSections,
}
