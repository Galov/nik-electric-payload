import { OrderStatus as StatusOptions } from '@/payload-types'
import { cn } from '@/utilities/cn'

type Props = {
  status: StatusOptions
  className?: string
}

export const OrderStatus: React.FC<Props> = ({ status, className }) => {
  if (!status) {
    return null
  }

  const labelByStatus: Record<string, string> = {
    cancelled: 'Отказана',
    completed: 'Завършена',
    processing: 'Обработва се',
  }

  return (
    <div
      className={cn(
        'text-xs tracking-widest font-mono uppercase py-0 px-2 rounded w-fit',
        className,
        {
          'bg-primary/10': status === 'processing',
          'bg-success': status === 'completed',
        },
      )}
    >
      {labelByStatus[status] || status}
    </div>
  )
}
