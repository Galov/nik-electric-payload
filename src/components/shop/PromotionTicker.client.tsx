'use client'

import { Price } from '@/components/Price'
import { useAuth } from '@/providers/Auth'
import type { Product } from '@/payload-types'
import { formatProductTitle, getProductPrimaryImage } from '@/utilities/product'
import { resolvePriceForTier } from '@/utilities/pricing'
import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'

type PromotionProduct = Pick<
  Product,
  'id' | 'images' | 'priceGroup1' | 'priceWholesale' | 'published' | 'slug' | 'title'
>

type Props = {
  products: PromotionProduct[]
}

export function PromotionTicker({ products }: Props) {
  const { user } = useAuth()

  if (!products.length) {
    return null
  }

  const loopedProducts = products.length > 1 ? [...products, ...products] : products

  return (
    <section className="mb-8 w-full max-w-full min-w-0 overflow-hidden rounded-[8px] border border-[rgb(0,126,229)]/10 bg-[linear-gradient(135deg,rgba(0,126,229,0.05),rgba(248,250,252,0.96))] [contain:layout_paint] [overflow-x:clip]">
      <div className="flex items-center justify-between gap-4 border-b border-[rgb(0,126,229)]/10 px-4 py-4 md:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgb(0,126,229)]/75">
            Промоции
          </p>
          <h2 className="mt-1 text-lg font-medium tracking-[-0.02em] text-primary/85">
            Актуални предложения
          </h2>
        </div>
      </div>

      <div className="promotion-ticker group relative w-full max-w-full min-w-0 overflow-hidden px-3 py-3 [contain:layout_paint] [overflow-x:clip] md:px-4">
        <div className="h-[148px] w-full" aria-hidden="true" />
        <div
          className={clsx(
            'promotion-ticker__track absolute left-3 top-3 flex w-max gap-3 md:left-4',
            products.length > 1 ? 'motion-safe:animate-[promotionTicker_55s_linear_infinite]' : '',
          )}
        >
          {loopedProducts.map((product, index) => {
            const image = getProductPrimaryImage(product)
            const priceTier = (user as typeof user & { priceTier?: 'general' | 'group1' | null })
              ?.priceTier
            const resolvedPrice = resolvePriceForTier(priceTier, {
              priceGroup1: product.priceGroup1,
              priceWholesale: product.priceWholesale,
            })

            return (
              <Link
                className="flex w-[320px] shrink-0 items-center gap-4 rounded-[8px] border border-white/80 bg-white/92 px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[rgb(0,126,229)]/18 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
                href={`/product/${product.slug}`}
                key={`${product.id}-${index}`}
              >
                <div className="relative flex h-22 w-22 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[rgb(248,250,252)]">
                  {image?.url ? (
                    <Image
                      alt={image.alt}
                      className="object-contain"
                      fill
                      sizes="64px"
                      src={image.url}
                    />
                  ) : (
                    <div className="h-full w-full bg-black/[0.03]" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[15px] font-medium leading-5 text-primary/85">
                    {formatProductTitle(product.title)}
                  </p>
                  {user ? (
                    <Price
                      amount={resolvedPrice}
                      className="mt-2 text-sm font-semibold text-[rgb(0,126,229)]"
                    />
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-[rgb(0,126,229)]/80">
                      Виж продукта
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .promotion-ticker:hover .promotion-ticker__track {
          animation-play-state: paused;
        }

        .promotion-ticker__track {
          will-change: transform;
        }

        @keyframes promotionTicker {
          from {
            transform: translateX(0);
          }

          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  )
}
