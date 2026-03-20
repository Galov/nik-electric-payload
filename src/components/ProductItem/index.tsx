import { Price } from '@/components/Price'
import { Product } from '@/payload-types'
import { getProductPrimaryImage } from '@/utilities/product'
import Image from 'next/image'
import Link from 'next/link'

type Props = {
  product: Product
  style?: 'compact' | 'default'
  quantity?: number
  /**
   * Force all formatting to a particular currency.
   */
  currencyCode?: string
}

export const ProductItem: React.FC<Props> = ({
  product,
  quantity,
  currencyCode,
}) => {
  const { title } = product
  const image = getProductPrimaryImage(product)
  const itemPrice = product.price
  const itemURL = `/products/${product.slug}`

  return (
    <div className="flex items-center gap-4">
        <div className="flex items-stretch justify-stretch h-20 w-20 p-2 rounded-lg border">
          <div className="relative w-full h-full">
            {image?.url && (
              <Image
                alt={image.alt}
                className="rounded-lg object-cover"
                fill
                sizes="80px"
                src={image.url}
              />
            )}
          </div>
        </div>
      <div className="flex grow justify-between items-center">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-lg">
            <Link href={itemURL}>{title}</Link>
          </p>
          <div>
            {'x'}
            {quantity}
          </div>
        </div>

        {itemPrice && quantity && (
          <div className="text-right">
            <p className="font-medium text-lg">Междинна сума</p>
            <Price
              className="font-mono text-primary/50 text-sm"
              amount={itemPrice * quantity}
              currencyCode={currencyCode}
            />
          </div>
        )}
      </div>
    </div>
  )
}
