// Runs a release only after nobody has held the key for `ms`, so leaving a screen and coming back
// within the window keeps what the key paid for instead of paying for it twice.
export function createGrace(ms: number, release: (key: string) => void) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function hold(key: string) {
    clearTimeout(timers.get(key))
    timers.delete(key)
  }

  return {
    hold,
    drop(key: string) {
      hold(key)
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          release(key)
        }, ms),
      )
    },
    clear() {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    },
  }
}
