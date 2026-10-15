// Maestro native-parser adapter. Fixed worker; no model-supplied executable or script.
import { extractNative } from "./extract.ts";
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (!input || typeof input !== "object" || !("path" in input) || typeof input.path !== "string" || !("source" in input) || typeof input.source !== "string" || input.source.length > 1_000_000) throw new Error("PARSER_INPUT_INVALID");
process.stdout.write(JSON.stringify(extractNative(input.path, input.source)));
