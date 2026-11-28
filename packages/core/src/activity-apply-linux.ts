export * as ActivityApplyLinux from "./activity-apply-linux"

import { createHash } from "node:crypto"
import path from "node:path"
import { Effect } from "effect"
import type { ActivityApplyService } from "./activity-apply"
import type { ActivityArmObjects } from "./activity-arm-objects"
import type { ActivityQuarantine } from "./activity-quarantine"
import { Omni } from "./omni"

export async function open(root: string) {
  if (!path.isAbsolute(root) || path.resolve(root) !== root || root === "/" || root.includes("\0")) return undefined
  const native = await Omni.quarantineLinuxProtected(root).catch(() => undefined)
  if (!native) return undefined
  const sourceRoot = path.join(root, "worktrees")
  const isSource = (source: string) => {
    if (!source.startsWith(sourceRoot + "/") || path.resolve(source) !== source) return false
    const parts = path.relative(sourceRoot, source).split("/")
    return parts.length === 2 && (parts[1] === ".turbo" || parts[1] === "node_modules")
  }
  const read = async (file: string): Promise<ActivityQuarantine.Reading> => {
    const identity = await native.quarantineProtectedInspect(root, file).catch(() => undefined)
    if (identity === null) return { state: "absent" }
    if (typeof identity === "string" && /^\d+:[1-9]\d*$/.test(identity)) return { state: "present", identity }
    return { state: "unavailable" }
  }
  const inspectProtectedSource = async (source: string) => {
    if (!isSource(source)) return undefined
    const reading = await read(source)
    return reading.state === "present" ? reading.identity : undefined
  }
  const active = new Set<string>()
  return {
    inspectProtectedSource,
    authority(objects: ReturnType<typeof ActivityArmObjects.make>): ActivityApplyService.Authority {
      const describe: ActivityApplyService.Authority["describe"] = (target) => {
        if (!isSource(target.label) || !objects.protectedIdentity(target)) return undefined
        const identity = createHash("sha256").update(JSON.stringify([target.targetID, target.generation])).digest("hex")
        return path.join(root, "quarantine", "q-" + identity)
      }
      return {
        describe,
        authorize: (tx, target) => describe(target) ? objects.authorize(tx, [target]) : Effect.succeed(false),
        prepare: (target, destination) => Effect.gen(function* () {
          if (describe(target) !== destination || active.has(target.label) || !(yield* objects.verify(target))) return undefined
          const source = target.label
          const identity = objects.protectedIdentity(target)
          if (!identity || identity !== (yield* Effect.promise(() => inspectProtectedSource(source))) || active.has(source)) return undefined
          active.add(source)
          const reread = async () => ({ original: await read(source), quarantine: await read(destination) })
          return {
            identity,
            release: async () => { active.delete(source) },
            adapter: {
              prepare: async () => ({
                facts: await reread(),
                claimant: "absent" as const,
                mutation: () => native.quarantineProtectedRename(root, source, destination, identity),
              }),
              reread,
            },
          }
        }),
      }
    },
  }
}
