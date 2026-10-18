// What `host.mjs` and `hosts.mjs` agree on, pure and side-effect free (so the host can import it without installing
// anything, and `teeth.mjs` can probe it): the `HOST-<marker> <pid> ...` line the host prints once its tree is up, and how
// the host learns that tree from the fixture's output.

/**
 * The pids of the host's `HOST-<name>` line in `out` (what the host has printed so far): `undefined` while there is no
 * complete line for it yet (a line is complete only with its newline), an `Error` when the line is malformed (not exactly
 * `count` distinct positive integers, single-space separated), otherwise the pids.
 */
export function parseMarker(out, name, count) {
  const lines = out.split("\n");
  lines.pop(); // what follows the last newline is not a line yet
  const line = lines.find((l) => l === `HOST-${name}` || l.startsWith(`HOST-${name} `));
  if (line === undefined) return undefined;
  const tokens = line.slice(`HOST-${name}`.length).trim().split(" ");
  if (tokens.length !== count || !tokens.every((t) => /^[1-9]\d*$/.test(t)) || new Set(tokens).size !== count) {
    return new Error(`malformed marker ${JSON.stringify(line)}: want ${count} distinct pids`);
  }
  return tokens.map(Number);
}

/**
 * Reads the fixture's `lines` until it said `READY` and `PID <level> <pid>` for every level 1..`descendants`; returns the
 * descendants' pids by level. Leaves the loop then (so the consumer is detached); output that ends first is an error.
 */
export async function untilTree(lines, descendants) {
  const pids = new Map();
  let ready = false;
  const complete = () => ready && Array.from({ length: descendants }, (_, i) => pids.has(i + 1)).every(Boolean);
  for await (const { text } of lines) {
    const found = /^PID (\d+) (\d+)$/.exec(text);
    if (found) pids.set(Number(found[1]), Number(found[2]));
    ready ||= text === "READY";
    if (complete()) return Array.from({ length: descendants }, (_, i) => pids.get(i + 1));
  }
  throw new Error(`the fixture's output ended before READY and PID 1..${descendants} (saw READY: ${ready}, levels: ${[...pids.keys()]})`);
}
