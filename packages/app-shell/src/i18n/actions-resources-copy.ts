export * as ActionsResourcesCopy from "./actions-resources-copy"

// Copy for Actions resources, artifacts and caches.
export const dict = {
  "orchestra.actions.resources.failed": "{{resource}} could not be loaded",
  "orchestra.actions.resources.failedDetail": "The provider request failed. Check the connection and sign-in, then refresh.",
  "orchestra.actions.cacheUsage.total": "Active usage is {{size}} across {{count}} cache keys, as reported by the provider.",
  "orchestra.actions.cacheUsage.listed": "The listed keys total {{size}}.",
} as const
