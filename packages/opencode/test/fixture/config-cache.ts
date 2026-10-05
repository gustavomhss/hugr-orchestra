export * as ConfigCacheTest from "./config-cache"

import { Global } from "@opencode-ai/core/global"

/** Path fixtures exercise both their local layer and InstanceRuntime's shared app. */
export async function invalidate(local: () => Promise<void>) {
  const outcomes = await Promise.allSettled([Promise.resolve().then(local), (async () => {
    const { AppRuntime } = await import("@/effect/app-runtime")
    const { Config } = await import("@/config/config")
    await AppRuntime.runPromise(Config.use.invalidate())
  })()])
  const errors: unknown[] = outcomes.flatMap((outcome) => outcome.status === "rejected" ? [outcome.reason] : [])
  if (errors.length) throw new AggregateError(errors, "Config fixture cache invalidation failed")
}

export async function withDirectory<A>(directory: string, local: () => Promise<void>, run: () => Promise<A>, dispose?: () => Promise<void>) {
  const previous = Global.Path.config
  const [execution] = await Promise.allSettled([(async () => {
    ;(Global.Path as { config: string }).config = directory
    await invalidate(local)
    return await run()
  })()])
  const cleanup = await Promise.allSettled([Promise.resolve().then(dispose)])
  ;(Global.Path as { config: string }).config = previous
  const restoration = await Promise.allSettled([invalidate(local)])
  const errors: unknown[] = [execution, ...cleanup, ...restoration].flatMap((outcome) => outcome.status === "rejected" ? [outcome.reason] : [])
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, "Config fixture execution/cleanup failed")
  if (execution.status !== "fulfilled") throw new Error("Config fixture execution did not settle")
  return execution.value
}
