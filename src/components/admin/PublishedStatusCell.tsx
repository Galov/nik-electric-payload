'use client'

import type { DefaultCellComponentProps } from 'payload'

export function PublishedStatusCell({ cellData }: DefaultCellComponentProps) {
  return <span>{cellData === true ? 'Публикуван' : 'Скрит'}</span>
}
