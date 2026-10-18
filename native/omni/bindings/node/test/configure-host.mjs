// The host of the configure() tests (WP-H, H4): each case needs a fresh process, because configure() works only before
// the addon is used. Run as a subprocess by `hardening.mjs`; prints one JSON line `{ case, outcomes }`.
//
//   <runtime> configure-host.mjs <case>
//
// Cases:
//   order       configure({ addon, supervisor }) loads that addon; its supervisor wins over HUGR_OMNI_SUPERVISOR; a different addon once loaded is refused;
//               configure() after spawn() is refused
//   no-fallback configure({ addon }) at a missing file fails loudly, never falling back to this checkout's build
//   env-addon   HUGR_OMNI_ADDON set through process.env (JS-side) is the addon that loads
//   env-run     a variable set through process.env after start reaches the child (Bun included)

import { join } from "node:path";
import { binaries, loadApi, root } from "./support.mjs";

const which = process.argv[2];
const { fixture } = binaries();
const omni = loadApi();
const target = process.env.CARGO_TARGET_DIR ?? join(root, "target");
const built = join(target, "debug", { darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" }[process.platform] ?? "libhugr_omni_node.so");
const outcomes = [];
const attempt = (what, fn) => {
  try {
    fn();
    outcomes.push([what, "ok"]);
  } catch (e) {
    outcomes.push([what, e?.code ?? "Error", String(e?.message ?? e)]);
  }
};

if (which === "order") {
  attempt("configure", () => omni.configure({ addon: built, supervisor: "/nonexistent/omni-wph/hugr-omni-supervisor" }));
  attempt("configure other addon", () => omni.configure({ addon: "/nonexistent/omni-wph/other.node" }));
  attempt("spawn", () => omni.spawn(fixture, ["exit=0"]));
  attempt("configure after spawn", () => omni.configure({}));
  attempt("configure bad field", () => omni.configure({ supervisor: 5 }));
} else if (which === "no-fallback") {
  attempt("configure missing addon", () => omni.configure({ addon: "/nonexistent/omni-wph/hugr_omni.node" }));
} else if (which === "env-addon") {
  process.env.HUGR_OMNI_ADDON = "/nonexistent/omni-wph/from-env.node";
  attempt("spawn", () => omni.spawn(fixture, ["exit=0"]));
} else if (which === "env-run") {
  process.env.OMNI_WPH_LATE = "set-at-run-time";
  const got = await omni.run(fixture, ["getenv=OMNI_WPH_LATE"]);
  const clean = await omni.run(fixture, ["getenv=OMNI_WPH_LATE"], { inheritEnv: false });
  outcomes.push(["inherited", got.stdout], ["clean", clean.stdout]);
} else {
  throw new Error(`unknown case ${which}`);
}
process.stdout.write(`${JSON.stringify({ case: which, outcomes })}\n`, () => process.exit(0));
