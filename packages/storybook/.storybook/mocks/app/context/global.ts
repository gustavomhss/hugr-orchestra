export function useGlobal() {
  return {
    ensureServerCtx: () => ({
      sync: {
        session: {
          get: () => undefined,
          resolve: async () => ({ directory: "/tmp/story" }),
        },
      },
    }),
  }
}
