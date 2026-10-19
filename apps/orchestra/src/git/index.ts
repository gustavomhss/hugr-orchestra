// V1's git command line lives in core now (`@orchestra/core/git-cli`), where V2 serves version control from it too.
// Named re-exports: a star re-export of core's self-namespaced module leaves the bundled namespace undefined.
export {
  collectLog,
  node,
  Service,
  type Base,
  type Commit,
  type Interface,
  type Item,
  type Kind,
  type Log,
  type LogBounds,
  type LogOptions,
  type Options,
  type Patch,
  type PatchOptions,
  type Result,
  type Stat,
} from "@orchestra/core/git-cli"
export * as Git from "."
