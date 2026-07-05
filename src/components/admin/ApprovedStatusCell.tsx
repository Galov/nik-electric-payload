'use client'

import type { DefaultCellComponentProps } from 'payload'

export function ApprovedStatusCell({ cellData }: DefaultCellComponentProps) {
  return <span>{cellData === true ? 'Одобрен' : 'Неодобрен'}</span>
}
