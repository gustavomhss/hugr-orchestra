// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type ArsenalContext } from "../contract.ts";
import { planMoveIn } from "./move-in.ts";
export async function main(argv: string[], context: ArsenalContext) {
  return planMoveIn(context, { budgetLoc: argv[1] === undefined ? undefined : Number(argv[1]) }, argv[0]);
}
