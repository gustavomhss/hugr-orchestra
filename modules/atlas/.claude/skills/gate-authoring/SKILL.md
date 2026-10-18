---
name: gate-authoring
description: >
  How to write a guard that cannot pass vacuously, cannot be satisfied by a stub, and does not lie about
  its own reach. The anti-vacuity contract (every way of not getting a list is a named failure), explicit
  delimiters over prose-sniffing, parse-not-regex, teeth tests, the ledger pattern for declared exceptions,
  and the rule that a gate change must be provably a strengthening. Invoke before adding or amending ANY
  CI gate, guard, or fitness function.
---

# gate-authoring — a gate that cannot fail is not a gate

## The one failure mode that matters

A gate that finds **zero** items, checks zero of them, and prints OK. _"Everything is documented"_ and
_"the extraction broke"_ then look identical, forever, in green.

So: **every way of not getting a list is an explicit, named FAILURE.** Not a skip, not a zero, not a
default. Enumerate them in the code: the file missing, the declaration missing, an initializer that is not
a literal, an element that is not a literal, and — the one always forgotten — **the list coming back
EMPTY**. An empty list is not "vacuously satisfied"; it is the extraction breaking.

```js
if (names.length === 0) {
  return {
    broken: `${ORACLE} extracted EMPTY. Either the surface really is empty, or this gate's reading
    of the file broke — and a gate that checks zero items would print OK for a completely unguarded
    product. Failing instead.`,
  }
}
```

## Delimit the region; never sniff it out of prose

A gate that scans a document for "lines that look like the table" silently widens and narrows as the prose
moves around it. **A check whose scope is inferred stops checking the moment the text moves.**

Use explicit markers (`<!-- x:begin --> … <!-- x:end -->`), and make a **missing marker a hard failure**.
The scope is then a fact, not a heuristic.

## Parse, do not pattern-match

A regex over source counts occurrences in comments and strings. Two real cases:

- `@atlas/memory` appears in prose comments across the tree; a pattern-based reachability check would have
  scored a dead package **alive**.
- A regex for `key: 'value'` matched bare identifiers only, so hyphenated keys (`'test-vacuities':`) were
  invisible. The blind spot never fired for years because no hyphenated key had yet mattered.

Use the real parser. It is already a dependency.

## The oracle lives elsewhere, and the gate holds no copy

A gate carrying its own list of the eight expected names is a **second source of truth** with exactly the
failure it exists to prevent: it would agree with itself, forever. Read the list from the source it checks.

Corollary: when the gate prints a summary, **derive the numbers from the arrays it just checked**. A
hand-written "5 tools / 2 doors / 6 read doors" in the OK line stayed wrong for a whole work package while
the arrays beside it already said 6/3/10.

## Check both directions

One direction is half a gate. Every correspondence check needs both legs:

- a shipped thing with no documentation, **and** a document naming a thing that does not ship;
- an unreached module the ledger omits, **and** a ledger row for something that is actually called.

The second leg feels redundant and is not: a ledger that understates is still false, and a ledger nobody
trusts is ignored in both directions.

## Teeth: plant every defect class the gate claims to catch

Its own `*.test.mjs` builds a throwaway fixture tree, plants each defect, and asserts the gate exits
non-zero **and names the thing**. The name is the entire product — _"some page is missing"_ sends nobody
anywhere.

Also assert the **clean tree passes**, so the gate cannot be satisfied by firing on everything.

And mutation-probe the gate against the **real** tree once: delete one real row and confirm it goes red.
A fixture-only proof leaves open that the gate never engages the actual corpus.

## Declared exceptions go in a ledger, never in silence

When something legitimately cannot satisfy the gate, the answer is a **ledger entry with a reason**, and
the ledger is shrink-only and self-reporting: a stale entry FAILS the gate. Never widen the gate to fit the
exception.

The judgment line: adding _one_ justified entry is hygiene. Adding **65** because your input was shaped
wrong is bulk-declaring a divergence you could simply not have had — fix the input instead. (Real: 62
requirement lifts paraphrased their invariant; rewriting the invariant to BE the join of its clauses took
one edit and added zero ledger entries.)

## Amending a gate: prove it is a strengthening

A gate change is the highest-risk diff in a repository, because a weakened gate is invisible afterwards.
Before amending, state which of these it is:

1. **Extension** — the pin now covers more (a new tool joins the expected surface). The pin still fails on
   any mismatch; nothing is loosened.
2. **Repair** — the gate was blind (the hyphenated-key regex). Say what it missed and for how long.
3. **Declared exception** — a ledger entry with a reason.
4. **Weakening** — needs an explicit human waiver, logged. There is no fourth silent option.

State the category in the commit message. A reviewer should never have to derive it from the diff.

## Do not grade prose

Check existence and correspondence, not quality. _"Must have an example"_ turns the gate into an editor,
and an editor nobody elected gets worked around rather than satisfied. Whether a page is any good is a
human job — say so in the gate's own output.

## Register it, or it does not run

A gate not named in CI is a file. Wire it into the runner **and** into whatever fitness test asserts that
every gate in the directory is invoked by name — and confirm the new gate exits non-zero on an empty tree,
which is the mechanical proof it has a reachable failure path at all.
