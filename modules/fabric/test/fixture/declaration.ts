import { Schema } from "effect"
import { optional, PositiveInt } from "@orchestra/schema/schema"
import type { Catalog } from "../../src/contracts"

const props = Schema.Struct({ title: optional(Schema.String) }).annotate({ parseOptions: { onExcessProperty: "error" } })
const args = Schema.Struct({ limit: optional(PositiveInt) }).annotate({ parseOptions: { onExcessProperty: "error" } })
const execution = { type: "ExecutionRef", revision: "1", nullable: true } as const
const resource = { type: "ResourceRef", revision: "1", nullable: true } as const

export const catalog: Catalog = {
  components: [
    { id: "fabric.runs", revision: "1", slots: ["main", "support"], props, inputs: {}, outputs: { selected: execution }, sourceResult: "executions@1" },
    { id: "fabric.logs", revision: "1", slots: ["main", "support"], props, inputs: { execution }, outputs: {}, sourceResult: "logs@1" },
    { id: "fabric.details", revision: "1", slots: ["inspect", "support"], props, inputs: { resource }, outputs: {} },
  ],
  capabilities: [
    { ref: { id: "fabric.execution.list", revision: "1" }, effect: "metadata-read", args, result: "executions@1" },
    { ref: { id: "fabric.execution.logs", revision: "1" }, effect: "metadata-read", args, result: "logs@1" },
    { ref: { id: "fabric.query", revision: "1" }, effect: "data-read", args, result: "rows@1" },
    { ref: { id: "fabric.write", revision: "1" }, effect: "definition-write", args, result: "executions@1" },
  ],
}

export const document = () => ({
  format: "fabric-studio.workspace", version: 1, title: "Investigar carga",
  context: { resourceAliases: ["carga"] },
  layout: { recipe: "investigate", revision: 1, overrides: {} },
  tools: [
    { id: "runs", component: { id: "fabric.runs", revision: "1" }, slot: "main", props: {},
      source: { capability: { id: "fabric.execution.list", revision: "1" }, resourceAlias: "carga" } },
    { id: "logs", component: { id: "fabric.logs", revision: "1" }, slot: "support", props: {},
      source: { capability: { id: "fabric.execution.logs", revision: "1" } } },
    { id: "details", component: { id: "fabric.details", revision: "1" }, slot: "inspect", props: {} },
  ],
  bindings: [
    { from: { tool: "runs", port: "selected" }, to: { tool: "logs", port: "execution" } },
    { from: { tool: "runs", port: "selected" }, to: { tool: "details", port: "resource" }, projection: "executionResource" },
  ],
} as const)
