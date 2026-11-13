// A zoom the user asked for. A stale write (a newer zoom already replaced it) is not this request.
// A failed current write reverts the requested factor and is reported. It does not reject.
export function settleZoom(input: {
  write: Promise<void>
  current: () => boolean
  apply: () => void
  revert: () => void
  report: (error: unknown) => void
}) {
  return input.write.then(
    () => {
      if (!input.current()) return false
      input.apply()
      return true
    },
    (error: unknown) => {
      if (!input.current()) return false
      input.revert()
      input.report(error)
      return false
    },
  )
}

// Pinch and repeated keys can fail on the same outage. Log each one. Toast only the first.
export function noteFailedZoom(input: { error: unknown; shown: boolean; report: (error: unknown) => void }) {
  console.error(input.error)
  if (input.shown) return true
  input.report(input.error)
  return true
}

// The main process sends zoom-factor-changed before the invoke reply. That echo is the success of this
// write, and it is also how a native menu zoom lands. It must clear the failure, or the next outage stays silent.
export function createZoomSession(input: {
  write: (factor: number) => Promise<void>
  report: (error: unknown) => void
  apply: (factor: number) => void
  revert: (factor: number) => void
}) {
  let generation = 0
  let shown = false
  let applied = 1

  return {
    stamp: () => generation,
    seen(factor: number) {
      applied = factor
      input.apply(factor)
    },
    echo(factor: number) {
      generation += 1
      shown = false
      applied = factor
      input.apply(factor)
    },
    ask(next: number) {
      const started = ++generation
      return settleZoom({
        write: input.write(next),
        current: () => started === generation,
        apply: () => {
          shown = false
          applied = next
          input.apply(next)
        },
        revert: () => input.revert(applied),
        report: (error) => {
          shown = noteFailedZoom({ error, shown, report: input.report })
        },
      })
    },
  }
}
