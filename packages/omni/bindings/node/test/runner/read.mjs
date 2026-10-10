// `read`: claims the single consumer (first time, or again after `detach` or in the other mode: the library decides
// whether that is allowed), reads until `until`, and reports what this step read.
//
// `until.match` and `capture` see complete lines, kept across steps: in chunks mode the runner splits on `\n` (dropping
// one trailing `\r`); in lines mode a line is the library's text as is, with `continues` pieces joined. A gap
// (`lostBefore`) ends the partial line, and the end of the output ends the last one. A step consumes whole items, so
// lines that arrive in the same chunk as its `until` match are read by that step. In lines mode the step's
// `stdout`/`stderr`/`pty` is each line's text followed by `\n` unless it continues.

import { bytesOf, failure, product } from "./expect.mjs";
import { pattern } from "./pattern.mjs";

const STREAMS = ["stdout", "stderr", "pty"];
const lossy = new TextDecoder("utf-8", { ignoreBOM: true });

const join = (parts) => {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** One `read` step on child `name`; `s` is the step. Returns an outcome (`{ fields }` or `{ error }`). */
export async function read(ctx, name, s) {
  const lines = s.lines === true;
  const until = s.until === undefined || s.until === "end" ? null : { re: pattern(s.until.match), n: s.until.count ?? 1 };
  const captures = Object.entries(s.capture ?? {}).map(([k, re]) => [k, pattern(re)]);
  const { child } = ctx.kid(name);
  // The consumer of this child, kept between `read` steps; `pending` is the partial line of stdout, stderr, pty.
  const kept = ctx.readers.get(name) ?? { it: null, lines: false, pending: [[], [], []] };
  ctx.readers.set(name, kept);
  const fresh = kept.it === null || kept.lines !== lines;
  let it = kept.it;
  if (fresh) {
    try {
      it = (lines ? child.lines() : child.output)[Symbol.asyncIterator]();
    } catch (e) {
      return failure(ctx.api, e);
    }
  }

  let matched = 0;
  const line = (bytes) => {
    const text = lossy.decode(bytes);
    for (const [key, re] of captures) {
      const m = re.exec(text);
      if (m) ctx.vars.set(key, [...(ctx.vars.get(key) ?? []), m[1] ?? m[0]]);
    }
    if (until?.re.test(text)) matched++;
  };
  const done = () => until !== null && matched >= until.n;
  const take = (k) => {
    const all = kept.pending[k].length === 0 ? new Uint8Array(0) : join(kept.pending[k]);
    kept.pending[k] = [];
    return all;
  };

  const data = [[], [], []];
  const pieces = [[], [], []]; // lines mode: every item as it came, for the `pieces` expectation
  let text = true;
  let chunks = 0;
  let lost = 0;
  let continues = 0;
  while (!done()) {
    let r;
    try {
      r = await it.next();
    } catch (e) {
      return failure(ctx.api, e);
    }
    if (fresh && kept.it !== it) Object.assign(kept, { it, lines }); // the claim worked: it replaces the old consumer
    if (r.done) {
      for (let k = 0; k < 3; k++) if (kept.pending[k].length > 0) line(take(k));
      if (until !== null && !done()) throw product(`output ended after ${matched} of ${until.n} matching lines`);
      break;
    }
    const item = r.value;
    const k = STREAMS.indexOf(item?.stream);
    if (k < 0) throw product(`the library yielded an item of an unknown stream: ${JSON.stringify(item?.stream)}`);
    const piece = lines ? item.text : item.data;
    if (typeof piece !== "string" && !(piece instanceof Uint8Array)) {
      throw product(`the library yielded ${lines ? "text" : "data"} that is neither a string nor a Uint8Array`);
    }
    const gap = item.lostBefore ?? 0;
    chunks++;
    lost += gap;
    if (gap > 0 && kept.pending[k].length > 0) line(take(k)); // a gap ends the partial line
    // A copy: the library may reuse the memory of a chunk it handed over.
    const bytes = typeof piece === "string" ? bytesOf(piece) : piece.slice();
    if (typeof piece !== "string") text = false;
    data[k].push(bytes);
    kept.pending[k].push(bytes);
    if (lines) {
      const more = item.continues === true;
      pieces[k].push({ bytes: bytes.length, continues: more });
      if (more) continues++;
      else {
        data[k].push(Uint8Array.of(10));
        line(take(k));
      }
    } else if (bytes.includes(10)) {
      // Only a piece with a newline completes lines (no rescan of a long partial line).
      const all = take(k);
      let start = 0;
      for (let nl = all.indexOf(10); nl !== -1; nl = all.indexOf(10, start)) {
        line(all.subarray(start, nl > start && all[nl - 1] === 13 ? nl - 1 : nl));
        start = nl + 1;
      }
      if (start < all.length) kept.pending[k].push(all.subarray(start));
    }
  }
  if (s.detach === true) {
    // Leaving the loop is what detaches for good.
    kept.it = null;
    try {
      await it.return?.();
    } catch (e) {
      return failure(ctx.api, e);
    }
  }
  const [stdout, stderr, pty] = data.map((parts) => {
    const all = parts.length === 0 ? new Uint8Array(0) : join(parts);
    return text ? lossy.decode(all) : all;
  });
  const [ps, pe, pp] = pieces;
  return {
    fields: {
      stdout, stderr, pty, chunks, lostBefore: lost, continues,
      pieces: { stdout: ps, stderr: pe, pty: pp },
      droppedBytes: child.droppedBytes,
    },
  };
}
