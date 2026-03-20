import { Button } from '@/components/ui/button'
import { ShoppingCart } from 'lucide-react'
import React from 'react'

export function OpenCartButton({
  quantity,
  ...rest
}: {
  quantity?: number
}) {
  return (
    <Button
      variant="link"
      size="clear"
      className="group relative inline-flex items-center gap-2 border-none px-0 py-0 font-sans text-sm font-medium no-underline text-primary/55 hover:text-primary/80 hover:no-underline"
      {...rest}
    >
      <ShoppingCart className="size-4 transition-colors group-hover:text-[rgb(0,126,229)]" />
      <span>Количка</span>

      {quantity ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[rgb(0,126,229)] px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
          {quantity}
        </span>
      ) : null}
    </Button>
  )
}
