/**
 * Registry of icon assets in /public/icons — the single source of truth for
 * icon paths. Import this instead of hardcoding "/icons/icon-x.svg" strings,
 * so a typo'd or renamed file fails at compile time, not with a silent 404.
 */
export const icons = {
  agent: '/icons/icon-agent.svg',
  arrowRight: '/icons/icon-arrow-right.svg',
  benefits: '/icons/icon-benefits.svg',
  bloom: '/icons/icon-bloom.svg',
  chat: '/icons/icon-chat.svg',
  close: '/icons/icon-close.svg',
  copy: '/icons/icon-copy.svg',
  diary: '/icons/icon-diary.svg',
  filter: '/icons/icon-filter.svg',
  grid: '/icons/icon-grid.svg',
  info: '/icons/icon-info.svg',
  issues: '/icons/icon-issues.svg',
  leaf: '/icons/icon-leaf.svg',
  light: '/icons/icon-light.svg',
  maintenance: '/icons/icon-maintenance.svg',
  placement: '/icons/icon-placement.svg',
  plus: '/icons/icon-plus.svg',
  reflections: '/icons/icon-reflections.svg',
  search: '/icons/icon-search.svg',
  soil: '/icons/icon-soil.svg',
  trash: '/icons/icon-trash.svg',
  trashCritical: '/icons/icon-trash-critical.svg',
  water: '/icons/icon-water.svg',
} as const

export type IconName = keyof typeof icons
