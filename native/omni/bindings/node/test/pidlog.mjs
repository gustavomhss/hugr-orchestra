// A run() exposes output only after completion. Its real fixture pidlog is the acquisition barrier instead.

import { readFile } from "node:fs/promises";
import { parseMarker } from "./markers.mjs";

/** Two complete, distinct fixture pids (root and tree=1 descendant), or a bounded observation failure. */
export async function loggedTree(path) {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const text = await readFile(path, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const lines = text.split("\n");
    lines.pop(); // An append may still be writing its final line.
    if (lines.length >= 2) {
      const pids = parseMarker(`HOST-PIDLOG ${lines.join(" ")}\n`, "PIDLOG", 2);
      if (pids instanceof Error) throw pids;
      return pids;
    }
    if (Date.now() >= deadline) throw new Error(`fixture pidlog did not contain two complete pids: ${JSON.stringify(text)}`);
    // Poll the external marker's state, never infer acquisition from a fixed sleep.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
