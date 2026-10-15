// `conformance/pending.txt`: the items that cannot pass yet, one `<ID> <WP>` per line (`#` starts a comment).
// A pending item that fails is reported as `pending`; a pending item that passes, an unknown ID and an ID
// listed twice fail the suite. Only the lead edits the ledger.

const isItem = (s) => /^C-[A-Z-]+-\d\d$/.test(s);
const isWp = (s) => /^[A-Z]+\d+[a-z]*$/.test(s);

/** The item of a scenario id: `C-KILL-01.tree` -> `C-KILL-01`. */
export const item = (scenario) => scenario.split(".")[0];

export class Ledger {
  /** The ledger and its errors (a malformed line, an ID listed twice). */
  constructor(text) {
    this.items = new Map();
    this.errors = [];
    text.split(/\r?\n/).forEach((raw, n) => {
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) return;
      const [id, wp, ...extra] = line.split(/\s+/);
      if (!isItem(id) || wp === undefined || !isWp(wp) || extra.length > 0) {
        this.errors.push(`pending.txt:${n + 1}: want \`<ID> <WP>\`, got ${JSON.stringify(line)}`);
      } else if (this.items.has(id)) {
        this.errors.push(`pending.txt:${n + 1}: ${id} is listed twice`);
      } else {
        this.items.set(id, wp);
      }
    });
  }

  pending(id) {
    return this.items.has(id);
  }

  /**
   * After the run. `known`: the items that have a scenario file; `passed`: for each item run here, whether every
   * one of its scenarios passed.
   */
  check(known, passed) {
    const errors = [];
    for (const [id, wp] of this.items) {
      if (!known.has(id)) {
        errors.push(`${id} (${wp}) is in conformance/pending.txt but no scenario proves it`);
      } else if (passed.get(id) === true) {
        errors.push(`${id} (${wp}) passes: remove it from conformance/pending.txt`);
      }
    }
    return errors;
  }
}
