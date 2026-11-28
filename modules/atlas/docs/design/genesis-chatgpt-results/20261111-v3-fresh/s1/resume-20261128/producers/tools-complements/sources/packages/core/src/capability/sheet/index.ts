export * as CapabilitySheets from "./index"

import { Effect } from "effect"
import { Tool } from "../../tool/tool"
import { CapabilityArtifacts } from "../artifact"
import { NativeDocuments } from "../document/native"
import { Output } from "../document/schema"
import { Edit, Read, mime } from "./schema"

export const make = (options: CapabilityArtifacts.Options = {}) => Effect.gen(function* () {
  const native = yield* NativeDocuments.make(options)
  return Object.freeze({
    sheet_read: Tool.make({ description: "Read authorized XLSX or UTF-8 CSV artifact. Literal values, formulas and cached results are distinct. Bounded ranges; no formula evaluation.",
      input: Read, output: Output,
      execute: (input, context) => native.execute("sheet_read", "sheet", input, context, [input.artifact], input.format === "csv" ? ["text/csv", "text/csv; charset=utf-8"] : [mime]),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }],
    }),
    sheet_edit: Tool.make({ description: "Create/edit XLSX cells, styles, names; limited A1 restructure. Create/edit/import/export UTF-8 CSV, literal by default. Formulas require explicit opt-in. No calculation engine, macros or external refresh.",
      input: Edit, output: Output,
      execute: (input, context) => {
        if ("expectedRevision" in input && input.expectedRevision !== input.artifact.revision)
          return Effect.fail(new Tool.Failure({ message: "revision_conflict: Expected revision does not match artifact" }))
        return native.execute("sheet_edit", "sheet", input, context, "artifact" in input ? [input.artifact] : [],
          input.format === "csv" ? ["text/csv", "text/csv; charset=utf-8"] : [mime],
          "expectedRevision" in input ? input.artifact : undefined)
      },
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }],
    }),
  })
})
