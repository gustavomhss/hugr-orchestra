export * as NativeDocuments from "./native"

import { randomUUID } from "node:crypto"
import { Capability } from "@orchestra/schema/capability"
import { Effect } from "effect"
import { Location } from "../../location"
import { Tool } from "../../tool/tool"
import { CapabilityArtifacts } from "../artifact"
import { CapabilityInvocation } from "../invocation"
import { CapabilityPolicy } from "../policy"
import { DocumentWork } from "./work"

export const make = (options: CapabilityArtifacts.Options = {}) => Effect.gen(function* () {
  const artifacts = yield* CapabilityArtifacts.make(options)
  const policy = yield* CapabilityPolicy.make
  const location = yield* Location.Service
  const authorize = (context: Tool.Context, name: string, resources: readonly string[]) => Effect.gen(function* () {
    const binding = yield* CapabilityInvocation.require(context, { projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) })
    if (binding.rootToolName !== name) return yield* new Capability.Failure({ code: "invocation_binding_mismatch",
      message: "Native document root tool does not match" })
    yield* policy.assert(context, { action: name, resources })
  })
  const execute = (name: string, kind: "pdf" | "sheet", input: unknown, supplied: Tool.Context,
    refs: readonly Capability.ArtifactRef[], mimes: readonly string[], update?: Capability.ArtifactRef) => Effect.gen(function* () {
    // Capture decoded caller data before the first policy or storage yield.
    const snapshot = yield* Effect.try({ try: () => structuredClone({ input, context: supplied, refs, update }),
      catch: () => DocumentWork.failure("unsupported_schema") })
    const resources = snapshot.refs.length ? snapshot.refs.map((ref) => `artifact:${ref.id}:${ref.revision}`) : [`capability:native:${kind}`]
    const context = snapshot.context
    yield* authorize(context, name, resources)
    const budget = { bytes: 0 }
    const data = yield* Effect.forEach(snapshot.refs, (ref) => artifacts.read(context, ref).pipe(Effect.flatMap((found) => {
      budget.bytes += found.data.byteLength
      if (budget.bytes > DocumentWork.limits.bytes) return Effect.fail(DocumentWork.failure("quota_exceeded"))
      return mimes.includes(found.metadata.mime) ? Effect.succeed(found.data) : Effect.fail(DocumentWork.failure("unsupported_schema"))
    })))
    const output = yield* DocumentWork.run(kind, snapshot.input, data)
    if (!output.files.length) yield* authorize(context, name, resources)
    const publication = { refs: [] as Capability.ArtifactRef[], unresolved: [] as string[] }
    yield* Effect.forEach(output.files, (file, index) => Effect.gen(function* () {
      if (publication.unresolved.length) return
      const outcome = yield* Effect.gen(function* () {
        yield* authorize(context, name, resources)
        const value: CapabilityArtifacts.Input = { ...file, kind: kind === "pdf" ? "document" : "sheet", verification: "verified" }
        // Trusted producer requirements: Artifact rechecks native and artifact permits under the SAME actor/SQL writer.
        const requirements = [{ action: name, resources }]
        return yield* snapshot.update ? artifacts.update(context, snapshot.update, value, requirements)
          : artifacts.publish(context, value, requirements)
      }).pipe(Effect.result)
      if (outcome._tag === "Failure") {
        if (!publication.refs.length) return yield* Effect.fail(outcome.failure)
        const code = outcome.failure instanceof Capability.Failure || outcome.failure instanceof CapabilityArtifacts.Failure
          ? outcome.failure.code : "artifact_publication_failed"
        publication.unresolved.push(`Publication stopped: ${code}; ${output.files.length - index} output artifacts not published`)
        return
      }
      publication.refs.push(outcome.success)
    }))
    const unresolved = [...output.incomplete, ...publication.unresolved]
    const artifactRefs = publication.refs
    const receipt = `native:${randomUUID()}`
    const result: Capability.Result = unresolved.length ? { status: "partial", receipt,
      summary: "Native operation completed with explicit limits", completedEffects: artifactRefs.length
        ? artifactRefs.map((ref) => `Published artifact:${ref.id}:${ref.revision}`) : [name],
      unresolvedEffects: unresolved, artifactRefs } : { status: "completed", receipt,
      summary: "Native operation read back and verified", verification: "verified", artifactRefs }
    return { result, metadata: output.metadata }
  }).pipe(Effect.mapError((error) => new Tool.Failure({ message: error instanceof Capability.Failure || error instanceof CapabilityArtifacts.Failure
    ? `${error.code}: ${error.message}` : "Native artifact operation failed" })))
  return { execute }
})
