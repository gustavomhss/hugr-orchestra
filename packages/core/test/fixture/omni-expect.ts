// Test-only expectations for the omni positive control (script/test-omni-control.ts, D-L1).
//
// A test that must spawn through omni calls expectSpawn(import.meta.path) inside its body, before it spawns. The
// control's global afterEach then settles that test: the omni spawns counted since the call are this test's own, so a
// spawn made by any other test or file cannot satisfy it. A test that never ran (a -t filter, skipIf, skip) never
// called expectSpawn and expects nothing. The preload and the tests import this same file, so they share this
// module's one list; it lives under test/ because nothing in the product needs it.
import { Omni } from "../../src/omni"

let open: { file: string; start: number } | undefined
const settled: { file: string; spawns: number }[] = []

/** Called inside a test that must spawn through omni; a second call in the same test keeps the first start. */
export function expectSpawn(file: string) {
  open ??= { file, start: Omni.snapshot().spawns }
}

/** The control's afterEach: records the open expectation, if this test made one, with its own spawn count. */
export function settle() {
  if (!open) return
  settled.push({ file: open.file, spawns: Omni.snapshot().spawns - open.start })
  open = undefined
}

/** Every settled expectation of this process, in test order. */
export function results() {
  return [...settled]
}
