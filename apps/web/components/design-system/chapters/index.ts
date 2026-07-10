import type { Chapter } from '../chapter-helpers'
import { overviewChapter } from './overview'
import { colorsChapter } from './colors'
import { typographyChapter } from './typography'
import { spacingChapter } from './spacing'
import { componentsChapter } from './components'
import { tokensChapter } from './tokens'

/** Sidebar order. Adding a chapter = add its file and list it here. */
export const chapters: Chapter[] = [
  overviewChapter,
  colorsChapter,
  typographyChapter,
  spacingChapter,
  componentsChapter,
  tokensChapter,
]
