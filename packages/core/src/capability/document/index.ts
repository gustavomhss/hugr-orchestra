export * as CapabilityDocuments from "./index"

import { Effect } from "effect"
import { Tool } from "../../tool/tool"
import { CapabilityArtifacts } from "../artifact"
import { NativeDocuments } from "./native"
import { Edit, Output, Read } from "./schema"

export const make = (options: CapabilityArtifacts.Options = {}) => Effect.gen(function* () {
  const native = yield* NativeDocuments.make(options)
  return Object.freeze({
    document_read: Tool.make({ description: "Read an authorized local PDF artifact: text, geometry, metadata, fields; optional bounded PNG raster. No OCR.",
      input: Read, output: Output,
      execute: (input, context) => native.execute("document_read", "pdf", input, context, [input.artifact], ["application/pdf"]),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }],
    }),
    document_edit: Tool.make({ description: "Create, fill, truly flatten, merge, split, rotate or stamp local PDF artifacts. Edits use expectedRevision CAS. Encryption unsupported.",
      input: Edit, output: Output,
      execute: (input, context) => {
        if ("expectedRevision" in input && input.expectedRevision !== input.artifact.revision)
          return Effect.fail(new Tool.Failure({ message: "revision_conflict: Expected revision does not match artifact" }))
        return native.execute("document_edit", "pdf", input, context,
          "artifacts" in input ? input.artifacts : "artifact" in input ? [input.artifact] : [], ["application/pdf"],
          "expectedRevision" in input ? input.artifact : undefined)
      },
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }],
    }),
  })
})
