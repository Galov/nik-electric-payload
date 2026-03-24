'use client'

import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { cn } from '@/utilities/cn'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Media } from '@/payload-types'
import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

type BannerSlide = {
  image?: Media | null | string
  openInNewTab?: boolean | null
  url?: null | string
}

type Props = {
  className?: string
  slides: BannerSlide[]
}

const AUTOPLAY_DELAY_MS = 5500

const renderSlide = (slide: BannerSlide, index: number) => {
  if (!slide?.image || typeof slide.image === 'string' || !slide.image.url) {
    return null
  }

  const image = slide.image
  const imageUrl = image.url

  if (typeof imageUrl !== 'string' || !imageUrl) {
    return null
  }

  const imageNode = (
    <div className="overflow-hidden rounded-[8px] bg-[rgb(248,250,252)] shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <Image
        alt={image.alt || `Банер ${index + 1}`}
        className="h-auto w-full"
        height={image.height || 480}
        sizes="(min-width: 1280px) 1100px, (min-width: 1024px) 900px, 100vw"
        src={imageUrl}
        width={image.width || 1600}
      />
    </div>
  )

  if (!slide.url?.trim()) {
    return imageNode
  }

  return (
    <Link
      className="block transition hover:opacity-95"
      href={slide.url}
      rel={slide.openInNewTab ? 'noreferrer noopener' : undefined}
      target={slide.openInNewTab ? '_blank' : undefined}
    >
      {imageNode}
    </Link>
  )
}

export const ShopBannerCarousel: React.FC<Props> = ({ slides, className }) => {
  const [api, setApi] = React.useState<CarouselApi>()
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const validSlides = React.useMemo(
    () =>
      slides.filter(
        (slide) => slide?.image && typeof slide.image !== 'string' && Boolean(slide.image.url),
      ),
    [slides],
  )

  React.useEffect(() => {
    if (!api || validSlides.length <= 1) return

    const interval = window.setInterval(() => {
      api.scrollNext()
    }, AUTOPLAY_DELAY_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [api, validSlides.length])

  React.useEffect(() => {
    if (!api) return

    const updateSelectedIndex = () => {
      setSelectedIndex(api.selectedScrollSnap())
    }

    updateSelectedIndex()
    api.on('select', updateSelectedIndex)
    api.on('reInit', updateSelectedIndex)

    return () => {
      api.off('select', updateSelectedIndex)
      api.off('reInit', updateSelectedIndex)
    }
  }, [api])

  if (validSlides.length === 0) {
    return null
  }

  if (validSlides.length === 1) {
    return <div className={className}>{renderSlide(validSlides[0], 0)}</div>
  }

  return (
    <div className={cn('relative', className)}>
      <Carousel className="w-full" opts={{ align: 'start', loop: true }} setApi={setApi}>
        <CarouselContent className="-ml-0">
          {validSlides.map((slide, index) => (
            <CarouselItem className="pl-0" key={index}>
              {renderSlide(slide, index)}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <button
        aria-label="Предишен банер"
        className="absolute left-4 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-white/10 text-white shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-[2px] transition hover:bg-white/18"
        onClick={() => api?.scrollPrev()}
        type="button"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        aria-label="Следващ банер"
        className="absolute right-4 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/85 bg-white/10 text-white shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-[2px] transition hover:bg-white/18"
        onClick={() => api?.scrollNext()}
        type="button"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
        {validSlides.map((_, index) => (
          <button
            aria-label={`Премини към банер ${index + 1}`}
            className={cn(
              'pointer-events-auto h-2.5 rounded-full border border-white/80 transition-all duration-300',
              index === selectedIndex
                ? 'w-8 bg-white/65'
                : 'w-2.5 bg-white/10 hover:bg-white/20',
            )}
            key={index}
            onClick={() => api?.scrollTo(index)}
            type="button"
          />
        ))}
      </div>
    </div>
  )
}
