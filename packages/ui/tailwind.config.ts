import type { Config } from 'tailwindcss'
import preset from '@paradoxui/tokens/preset'

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx}'],
}

export default config
