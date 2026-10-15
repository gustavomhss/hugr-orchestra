// @atlas/contracts — tool.ts
//
// The MCP tool-schema record — the ONE shared shape a callable advertises over the transport.
// Declared in layer-0 because @atlas/tools and @atlas/retrieval must expose byte-identical schemas.

/** A callable's advertised schema, as surfaced over MCP / poke / CLI (one handler, TOOLS-10). The
 *  `inputSchema` is a JSON-Schema object (kept structural — the schema DSL is the external MCP
 *  standard, not an atlas-owned shape). */
export interface ToolSchema {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}
