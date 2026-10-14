// harness/lib/lexing.mjs — reading TypeScript correctly, once, for every gate that has to.
//
// WHY THIS IS ITS OWN MODULE. It was born inside `reachability.mjs` and moved out the moment
// `layer-guard.mjs` imported it: a helper two gates depend on is INFRASTRUCTURE, not a private part of
// whichever gate happened to need it first. Leaving it there also pushed that file past the repo's 400-LOC
// bar — a real signal, not a formality. `godfile-guard` scopes to `packages/**` and would never have said
// so, and "the guard did not look here" is exactly the reference-model-versus-shipped-path reasoning this
// repo has already paid for once.
//
// WHY GATES KEEP GETTING THIS WRONG, in this repo's own history. Three successive hand-written scanners in
// `reachability.mjs` each shipped a FAIL-OPEN, and each fix was correct about its case and wrong about its
// class:
//
//   1. block comments stripped before line comments: a line comment containing a glob (`packages/<star>/src`)
//      holds the byte pair slash-then-star, which the block pass reads as an opener.
//   2. one `${` depth counter: a `}` from an object literal drove it to zero and a nested backtick then
//      closed the OUTER template.
//   3. REGEX LITERALS: a backtick inside one opened an unterminated template; `/a\/*b/` opened a phantom
//      block comment; `/}/g` inside an interpolation reopened the hole fix 2 had just closed.
//
// Then `layer-guard.mjs` shipped hole (1) AGAIN, independently, in its own copy of the two-regex form —
// which is the entire argument for this file existing. Telling a regex from division needs the preceding
// token; a correct JS/TS lexer is not a side project, and every miss fails OPEN and SILENT in a gate whose
// job is to not miss things. So lexing is delegated to `typescript` (a direct devDependency this repo
// already builds with) and stops being any gate's problem.

import ts from "typescript"

/**
 * Blank every COMMENT in `text`, byte-for-byte, leaving code, strings, templates and regex literals intact.
 *
 * THE DEFECT IT EXISTS TO KILL. `layer-guard.mjs` carried its own stripper — a block-comment replace chained
 * onto a line-comment replace — which is hole (1) above verbatim: a line comment holding a glob contains the
 * byte pair slash-then-star, the BLOCK pass runs FIRST and reads it as a comment opener, and everything down
 * to the next real closer is deleted. In `reachability.mjs` that class failed open by dropping edges; in
 * `layer-guard.mjs` it failed open by dropping IMPORT STATEMENTS, so a forbidden edge sitting under such a
 * line was a false PASS. MEASURED on master before the fix: 11 real `@atlas/*` imports across 7 files were
 * never parsed. The triggers were all ordinary prose — `packages/<star>/src`, `packages/<star><star>`,
 * `refs/notes/<star>` — and the sharpest was `mcp-server/src/server.ts:7`, a comment that names
 * `npm run layer-guard` on the same line as the glob that blinded it.
 *
 * (Written without a literal regex in this paragraph on purpose: the first draft of this very comment
 * embedded the two-regex form, whose `[^\n]*` followed by `/g` puts a star-then-slash in the text and closed
 * the comment early. Node refused to load the module. The bug is not exotic — it bit its own postmortem.)
 *
 * HOW IT AVOIDS BECOMING SCANNER NUMBER FOUR. The TOKEN BOUNDARIES come from the real parser: `node.pos`
 * includes preceding trivia, `node.getStart()` does not, so the gap between them is trivia BY CONSTRUCTION —
 * whitespace and comments, nothing else. Inside a region the parser has already certified as trivia there is
 * no regex-versus-division question and no unterminated-literal question left to get wrong, so the two-line
 * comment recogniser below is total over its domain.
 *
 * Comments are BLANKED (spaces), not deleted, so every byte offset in the result still addresses the same
 * byte of the input. That is load-bearing, not tidiness: `layer-guard`'s leg-binding scan brace-matches by
 * INDEX and anchors on `^\s*`, so a stripper that shortened the text would move the block it then reads.
 * Newlines are preserved for the same reason.
 */
export function stripComments(text, fileName = "in-memory.ts") {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const out = [...text]
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (out[i] !== "\n" && out[i] !== "\r") out[i] = " "
  }
  const trivia = (from, to) => {
    let i = from
    while (i < to) {
      if (text[i] === "/" && text[i + 1] === "/") {
        let j = i + 2
        while (j < to && text[j] !== "\n" && text[j] !== "\r") j++
        blank(i, j)
        i = j
      } else if (text[i] === "/" && text[i + 1] === "*") {
        const close = text.indexOf("*/", i + 2)
        const j = close < 0 ? to : Math.min(close + 2, to)
        blank(i, j)
        i = j
      } else i++
    }
  }
  const walk = (node) => {
    const kids = node.getChildren(sf)
    if (kids.length === 0) {
      trivia(node.pos, node.getStart(sf))
      return
    }
    for (const kid of kids) walk(kid)
  }
  walk(sf)
  // The EndOfFileToken carries the file's trailing trivia; `getChildren` on SourceFile yields it, so the
  // walk above already covers a comment that closes the file with no code after it. Asserted by fixture.
  return out.join("")
}
