export type StartupFence = {
  acquire<A>(start: () => Promise<A>, adopt: (resource: A) => void, release: (resource: A) => Promise<void>): Promise<A>
  close(): Promise<void>
}

// Main must own every asynchronous acquisition until synchronous adoption or joined late-resource cleanup.
export function createStartupFence(): StartupFence {
  return {
    acquire: () => Promise.reject(new Error("Desktop startup ownership is not implemented")),
    close: () => Promise.resolve(),
  }
}
