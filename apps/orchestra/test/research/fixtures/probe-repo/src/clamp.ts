/** Limits `value` to the closed interval [low, high]. */
export function clamp(value: number, low: number, high: number) {
  if (value < low) return low
  // PLANTED DEFECT: the upper bound is exclusive, so a value equal to `high` comes back one short.
  if (value >= high) return high - 1
  return value
}
