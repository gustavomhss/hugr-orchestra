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
  const contextRevision = initial.context.items()
  const contextVersion = JSON.stringify(contextRevision)
  const submittedPrompt = structuredClone(unwrap(input.prompt))
  const submittedContext = structuredClone(unwrap(input.context))
  let target = input.target
  let targetRevision = revision
  let targetVersion = version
  let targetContextRevision = contextRevision
  let targetContextVersion = contextVersion
  let cleared: Prompt | undefined
  let clearedVersion: string | undefined
  let edited = false
  let contextEdited = false
  let clearedContext: ReturnType<PromptTarget["context"]["items"]> | undefined
  let clearedContextVersion: string | undefined
  let consumed: typeof submittedContext = []

  return {
    prompt: submittedPrompt,
    context: submittedContext,
    target: () => target,
    clear(context: "none" | "comments" | "all" = "none") {
      contextEdited ||=
        target.context.items() !== targetContextRevision ||
        JSON.stringify(target.context.items()) !== targetContextVersion
      if (context !== "none" && !contextEdited) {
        consumed = submittedContext.filter((item) => context === "all" || !!item.comment?.trim())
        consumed.forEach((item) => target.context.remove(item.key))
        clearedContext = target.context.items()
        clearedContextVersion = JSON.stringify(clearedContext)
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
      contextEdited ||=
        initial.context.items() !== contextRevision ||
        JSON.stringify(initial.context.items()) !== contextVersion ||
        (next !== initial && next.context.items().length > 0)
      initial.context.items().forEach(next.context.add)
      const occupied = next !== initial && next.dirty()
      if (occupied) edited = true
      if (initial.current() !== revision || JSON.stringify(initial.current()) !== version) {
        edited = true
        if (!occupied) next.set(initial.current(), initial.cursor())
      }
      target = next
      targetRevision = next.current()
      targetVersion = JSON.stringify(next.current())
      targetContextRevision = next.context.items()
      targetContextVersion = JSON.stringify(next.context.items())
    },
    current: (value: PromptTarget) => target === value,
    restore() {
      if (
        !contextEdited &&
        clearedContext !== undefined &&
        target.context.items() === clearedContext &&
        JSON.stringify(target.context.items()) === clearedContextVersion
      ) {
        consumed.forEach(target.context.add)
        clearedContext = undefined
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
