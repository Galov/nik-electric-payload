export const toMinorUnits = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round((value + Number.EPSILON) * 100)
}

export const fromMinorUnits = (value?: null | number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return value / 100
}
