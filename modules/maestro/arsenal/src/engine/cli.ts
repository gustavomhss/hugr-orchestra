// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
// Host-bound CLI adapter; standalone authority must come from caller, never argv.
import { type ArsenalContext } from "../contract.ts";
import { runDecompose } from "./run-decompose.ts";
import { AcquisitionError } from "./acquisition.ts";
export async function main(argv: string[], context: ArsenalContext) {
  const [targetPath, k, ...rest] = argv;
  if (!targetPath || !k || rest.some((arg, index) => arg !== "--write" && rest[index - 1] !== "--write")) throw new AcquisitionError("CLI_ARGUMENT_INVALID", "usage: <target.ts> <k> [--write <directory>]");
  const index = rest.indexOf("--write");
  if (index >= 0 && !rest[index + 1]) throw new AcquisitionError("CLI_ARGUMENT_INVALID", "--write requires destination");
  return runDecompose({ targetPath, k: Number(k), materialize: index >= 0 ? { directory: rest[index + 1] } : undefined }, context);
}
