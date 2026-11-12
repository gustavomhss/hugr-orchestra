export * as ActivityWorktreeRegistry from "./activity-worktree"

import type { ActivityWorktree } from "@orchestra/core/activity-worktree"
import type { ActivityDisk } from "@orchestra/core/activity-disk"
import { Database } from "@orchestra/core/database/database"
import { Context, Effect, Layer } from "effect"

export class Service extends Context.Service<Service, ActivityWorktree.Monitor>()(
  "@orchestra/server/ActivityWorktreeRegistry",
) {}

// Compilable unavailable source/collector anchor; no fabricated empty inventory.
export function layer(_input: { measure?: typeof ActivityDisk.measure; afterRegistryRead?: () => Promise<void> } = {}) {
  return Layer.effect(
    Service,
    Effect.map(Database.Service, () => ({
      snapshot() {
        throw new Error("Registered worktree HTTP collector is not implemented")
      },
      inventory: () => Promise.reject(new Error("Registered worktree HTTP collector is not implemented")),
      read: () => Promise.reject(new Error("Registered worktree HTTP collector is not implemented")),
    })),
  )
}
