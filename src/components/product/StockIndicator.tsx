'use client'
import { Product } from '@/payload-types'

type Props = {
  product: Product
}

export const StockIndicator: React.FC<Props> = ({ product }) => {
  const stockQuantity = product.inventory || 0

  return (
    <div className="text-sm font-normal text-muted-foreground">
      {stockQuantity > 0 ? <p>Наличност: {stockQuantity}</p> : <p>Изчерпана наличност</p>}
    </div>
  )
}
