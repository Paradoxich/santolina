'use client'

import { useState } from 'react'
import Image, { type ImageProps } from 'next/image'

const PLACEHOLDER_SRC = '/placeholder-img.png'

interface PlantImageProps extends Omit<ImageProps, 'src' | 'onError'> {
  src?: string | null
}

/** Falls back to the shared placeholder when a plant has no image (Trefle gap) or the image URL fails to load. */
export function PlantImage({ src, alt, ...rest }: PlantImageProps) {
  const [failed, setFailed] = useState(false)

  return (
    <Image
      src={failed || !src ? PLACEHOLDER_SRC : src}
      alt={alt}
      onError={() => setFailed(true)}
      {...rest}
    />
  )
}

export default PlantImage
