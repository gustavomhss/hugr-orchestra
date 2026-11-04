/**
 * Settles the page's wait for its stored prompt and workspace choice. A store that failed to load must not
 * reject into the router boundary or leave the page suspended: it resolves false, reports the error, and the
 * page opens with the defaults.
 */
export function settleNewSessionReady(wait: Promise<unknown>, report: (error: unknown) => void) {
  return wait.then(
    () => true,
    (error: unknown) => {
      report(error)
      return false
    },
  )
}
