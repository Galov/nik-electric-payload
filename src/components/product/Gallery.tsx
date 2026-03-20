'use client'

import type { Product } from '@/payload-types'

import React from 'react'
import Image from 'next/image'

import { Carousel, CarouselApi, CarouselContent, CarouselItem } from '@/components/ui/carousel'
import { resolveProductImageURL } from '@/utilities/product'

type Props = {
  gallery: NonNullable<Product['images']>
}

export const Gallery: React.FC<Props> = ({ gallery }) => {
  const [current, setCurrent] = React.useState(0)
  const [, setApi] = React.useState<CarouselApi>()
  const currentImage = gallery[current]
  const currentUrl = resolveProductImageURL(currentImage)

  return (
    <div>
      <div className="relative mb-8 aspect-square w-full overflow-hidden rounded-lg border bg-primary-foreground">
        {currentUrl ? (
          <Image
            alt={currentImage?.alt || ''}
            className="object-cover"
            fill
            sizes="(min-width: 1024px) 40rem, 100vw"
            src={currentUrl}
          />
        ) : null}
      </div>

      <Carousel setApi={setApi} className="w-full" opts={{ align: 'start', loop: false }}>
        <CarouselContent>
          {gallery.map((item, i) => {
            const imageUrl = resolveProductImageURL(item)

            if (!imageUrl) return null

            return (
              <CarouselItem
                className="basis-1/5"
                key={`${imageUrl}-${i}`}
                onClick={() => setCurrent(i)}
              >
                <div
                  className={`relative aspect-square overflow-hidden rounded-lg border ${
                    i === current ? 'border-blue-600' : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <Image
                    alt={item.alt || ''}
                    className="object-cover"
                    fill
                    sizes="120px"
                    src={imageUrl}
                  />
                </div>
              </CarouselItem>
            )
          })}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
