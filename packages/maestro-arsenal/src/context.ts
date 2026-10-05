import type { ArsenalContext, Effect } from "./contract"

/** Capture host values synchronously; selected handlers receive only declared authority. */
export function captureContext(effects: readonly Effect[], context?: ArsenalContext): ArsenalContext | undefined {
  if (!effects.length || !context) return
  const allowed = Object.freeze([...effects])
  const authorize = context.authorize
  const captured: ArsenalContext = {
    directory: context.directory,
    stateDirectory: context.stateDirectory,
    projectID: context.projectID,
    async authorize(request) {
      const effect = request.effect
      if (!allowed.includes(effect)) throw new Error(`undeclared_effect: ${effect}`)
      await authorize.call(captured, Object.freeze({
        effect,
        paths: Object.freeze([...request.paths]),
        commands: Object.freeze([...request.commands]),
      }))
    },
  }
  return Object.freeze(captured)
}
