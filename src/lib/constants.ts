export type SortFilterItem = {
  reverse: boolean
  slug: null | string
  title: string
}

export const defaultSort: SortFilterItem = {
  slug: null,
  reverse: true,
  title: 'Най-нови',
}

export const sorting: SortFilterItem[] = [
  defaultSort,
  { slug: 'title', reverse: false, title: 'Азбучно А-Я' },
  { slug: '-title', reverse: true, title: 'Азбучно Я-А' },
  { slug: 'sku', reverse: false, title: 'Код: А-Я' },
  { slug: '-sku', reverse: true, title: 'Код: Я-А' },
]
