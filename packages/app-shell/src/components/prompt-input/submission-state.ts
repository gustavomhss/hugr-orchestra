import { type ContextItem, type Prompt, type usePrompt } from "@/context/prompt"
import { unwrap } from "solid-js/store"

type PromptTarget = ReturnType<ReturnType<typeof usePrompt>["capture"]>

export function createPromptSubmissionState(input: {
  target: PromptTarget
  prompt: Prompt
  context: (ContextItem & { key: string })[]
}) {
  const initial = input.target
  const revision = initial.current()
  const version = JSON.stringify(revision)
  const submittedPrompt = structuredClone(unwrap(input.prompt))
  const submittedContext = structuredClone(unwrap(input.context))
  const submittedByKey = new Map(submittedContext.map((item) => [item.key, JSON.stringify(item)]))
  let target = input.target
  let targetRevision = revision
  let targetVersion = version
  let destinationKeys: Set<string> | undefined
  let cleared: Prompt | undefined
  let clearedVersion: string | undefined
  let edited = false
  const consumed = new Set<string>()

  return {
    prompt: submittedPrompt,
    context: submittedContext,
    target: () => target,
    clear(context: "none" | "comments" | "all" = "none") {
      if (context !== "none") {
        const submitted = (item: typeof submittedContext[number]) =>
          (context === "all" || !!item.comment?.trim()) && submittedByKey.get(item.key) === JSON.stringify(item)
        target.context.items().filter((item) => !destinationKeys?.has(item.key) && submitted(item)).forEach((item) => {
          consumed.add(item.key)
          target.context.remove(item.key)
        })
        if (initial !== target) initial.context.items().filter(submitted).forEach((item) => initial.context.remove(item.key))
      }
      if (initial !== target && initial.current() === revision && JSON.stringify(initial.current()) === version)
        initial.reset()
      if (edited || target.current() !== targetRevision || JSON.stringify(target.current()) !== targetVersion) {
        edited = true
        return
      }
      target.reset()
      cleared = target.current()
      clearedVersion = JSON.stringify(cleared)
      return true
    },
    retarget(next: PromptTarget) {
      // A context item already in the Session belongs to its own composer.
      destinationKeys = next === initial ? undefined : new Set(next.context.items().map((item) => item.key))
      if (next !== initial) {
        initial.context.items().forEach(next.context.add)
      }
      const occupied = next !== initial && next.dirty()
      if (occupied) edited = true
      if (initial.current() !== revision || JSON.stringify(initial.current()) !== version) {
        edited = true
        if (!occupied) next.set(initial.current(), initial.cursor())
      }
      target = next
      targetRevision = next.current()
      targetVersion = JSON.stringify(next.current())
    },
    current: (value: PromptTarget) => target === value,
    restore() {
      if (consumed.size > 0) {
        const currentKeys = new Set(target.context.items().map((item) => item.key))
        const missing = submittedContext.filter((item) => consumed.has(item.key) && !currentKeys.has(item.key))
        consumed.clear()
        missing.forEach(target.context.add)
      }
      if (edited) return
      if (
        cleared !== undefined &&
        (target.current() !== cleared || JSON.stringify(target.current()) !== clearedVersion)
      )
        return
      return { target, prompt: submittedPrompt, context: submittedContext }
    },
  }
}
