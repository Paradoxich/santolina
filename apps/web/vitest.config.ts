import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the app's pure logic (e.g. lib/care-tips). Node environment —
// these modules touch no DOM. The '@' alias mirrors tsconfig's "@/*": "./*".
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
