'use client'

import { useState } from 'react'
import { Select } from '@paradoxui/ui'

/**
 * The Forms chapter is a server module, and a Select has to hold a value to
 * demonstrate the thing that makes it a Select rather than a Menu — that the
 * trigger announces what is chosen. So the state lives here rather than
 * turning the whole chapter into a client component.
 */
export function SelectDemo() {
  const [scope, setScope] = useState<string | null>('garden')
  return (
    <Select
      label="What is this about"
      options={[
        { value: 'garden', label: 'Your garden' },
        { value: 'jasmine', label: 'Common jasmine' },
        { value: 'gone', label: 'No longer growing', disabled: true },
      ]}
      value={scope}
      onChange={setScope}
    />
  )
}
