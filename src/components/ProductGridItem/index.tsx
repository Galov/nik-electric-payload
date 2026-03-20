import type { Product } from '@/payload-types'

import Link from 'next/link'
import React from 'react'
import clsx from 'clsx'
import { Price } from '@/components/Price'
import Image from 'next/image'
import { getProductPrimaryImage } from '@/utilities/product'

type Props = {
  product: Partial<Product>
}

export const ProductGridItem: React.FC<Props> = ({ product }) => {
  const { price, title } = product
  const image = getProductPrimaryImage(product)

  return (
    <Link className="relative inline-block h-full w-full group" href={`/products/${product.slug}`}>
      {image?.url ? (
        <div
          className={clsx(
            'relative aspect-square overflow-hidden rounded-2xl border bg-primary-foreground p-8',
          )}
        >
          <Image
            alt={image.alt}
            className={clsx('h-full w-full rounded-2xl object-cover', {
              'transition duration-300 ease-in-out group-hover:scale-102': true,
            })}
            fill
            sizes="(min-width: 1024px) 20rem, (min-width: 640px) 16rem, 100vw"
            src={image.url}
          />
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-primary/60 group-hover:text-primary/80">
        <div className="pr-4 text-sm font-medium leading-snug">{title}</div>

        {typeof price === 'number' && (
          <div className="shrink-0 text-xs font-medium text-primary/55">
            <Price amount={price} />
          </div>
        )}
      </div>
    </Link>
  )
}
