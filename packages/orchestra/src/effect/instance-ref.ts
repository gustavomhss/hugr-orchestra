import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@orchestra/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~orchestra/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~orchestra/WorkspaceRef", {
  defaultValue: () => undefined,
})
