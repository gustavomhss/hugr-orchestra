import path from "node:path"
import { tmpdir } from "./tmpdir"

export async function inventoryFixture() {
  const fixture = await tmpdir()
  const files = {
    "package.json": JSON.stringify({ name: "fixture", workspaces: { packages: ["packages/*", "packages/sdk/js", "packages/omni/bindings/node"] }, patchedDependencies: { "fix@1": "patches/fix.patch" } }),
    "bun.lock": "bun fixture lock\n",
    "foundation/atlas/package.json": JSON.stringify({ name: "atlas", workspaces: ["packages/*"] }),
    "foundation/atlas/package-lock.json": "{}\n",
    "foundation/atlas/packages/contracts/package.json": JSON.stringify({ name: "@fixture/contracts" }),
    "packages/schema/package.json": JSON.stringify({ name: "@fixture/schema", exports: { ".": "./src/index.ts", "./v1": "./src/v1.ts" }, dependencies: { pinned: "file:./vendor/pinned.tgz" } }),
    "packages/schema/vendor/pinned.tgz": "pinned bytes\n",
    "packages/client/package.json": JSON.stringify({ name: "@fixture/client" }),
    "packages/sdk/js/package.json": JSON.stringify({ name: "@fixture/sdk" }),
    "packages/omni/bindings/node/package.json": JSON.stringify({ name: "binding", type: "commonjs", main: "index.js", types: "index.d.ts" }),
    "packages/omni/Cargo.toml": '[workspace]\nmembers = ["crates/*", "bindings/node"]\n',
    "packages/omni/Cargo.lock": "cargo fixture lock\n",
    "packages/omni/crates/runtime/Cargo.toml": '[package]\nname = "runtime"\nversion = "1.0.0"\n[dependencies]\nserde = { version = "1", features = ["derive"] }\n',
    "packages/omni/bindings/node/Cargo.toml": '[package]\nname = "binding"\nversion = "1.0.0"\n[lib]\ncrate-type = ["cdylib"]\n',
    "packages/omni/qa/Cargo.toml": '[package]\nname = "qa"\nversion = "1.0.0"\n[workspace]\n[[bin]]\nname = "qa-run"\npath = "src/main.rs"\n',
    "packages/omni/qa/Cargo.lock": "qa fixture lock\n",
    "packages/skills/entry/SKILL.md": "# Runtime asset\n",
    "patches/fix.patch": "fixture patch\n",
  }
  await Promise.all(Object.entries(files).map(([file, bytes]) => Bun.write(path.join(fixture.path, file), bytes)))
  return fixture
}
