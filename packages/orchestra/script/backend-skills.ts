import path from "path"

// The backend specialist's packaged skills (F6.12) as one generated module: tree-relative path -> file text. Both the
// Bun binary (script/build.ts) and the desktop Node sidecar (script/build-node.ts) embed it; src/maestro/backend-skill-root.ts
// extracts it to a real directory at runtime.
export async function backendSkillsModule(root: string) {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: root }))).map((file) => file.replaceAll("\\", "/")).sort()
  const entries = await Promise.all(
    files.map(async (file) => `  ${JSON.stringify(file)}: ${JSON.stringify(await Bun.file(path.join(root, file)).text())},`),
  )
  return ["export default {", ...entries, "}"].join("\n")
}
