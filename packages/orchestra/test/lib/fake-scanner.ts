import { rmSync } from "node:fs"
import { chmod, mkdir, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

// Atlas launches its scanner through execFileSync with no shell, so a shell script cannot stand in for it on Windows.
// There the fake is a real executable: a one-line Bun script compiled once per process. `clean` reports every record
// clean; `broken` answers --version but never completes a scan; `cwd` reports a record clean only when it runs in an
// empty directory, where a real scanner would find no .gitleaks.toml or .gitleaksignore to read.
const SOURCES = {
  clean: 'await Bun.stdin.text()\nprocess.exit(0)\n',
  broken: 'if (process.argv.includes("--version")) process.exit(0)\nawait Bun.stdin.text()\nprocess.exit(2)\n',
  cwd: 'import { readdirSync } from "node:fs"\nif (process.argv.includes("--version")) process.exit(0)\nawait Bun.stdin.text()\nprocess.exit(readdirSync(".").length === 0 ? 0 : 2)\n',
}
const SCRIPTS = {
  clean: "#!/bin/sh\n/bin/cat >/dev/null\nexit 0\n",
  broken: '#!/bin/sh\n[ "$1" = "--version" ] && exit 0\n/bin/cat >/dev/null\nexit 2\n',
  cwd: '#!/bin/sh\n[ "$1" = "--version" ] && exit 0\n/bin/cat >/dev/null\n[ -z "$(/bin/ls -A)" ] || exit 2\nexit 0\n',
}

export type FakeScanner = keyof typeof SOURCES

const compiled = new Map<FakeScanner, Promise<string>>()

export function fakeScanner(kind: FakeScanner, dir: string) {
  if (process.platform === "win32") return compiled.get(kind) ?? compile(kind)
  return writeScript(kind, dir)
}

async function writeScript(kind: FakeScanner, dir: string) {
  const command = path.join(dir, ".test-bin", "gitleaks")
  await mkdir(path.dirname(command), { recursive: true })
  await Bun.write(command, SCRIPTS[kind])
  await chmod(command, 0o755)
  return command
}

function compile(kind: FakeScanner) {
  const built = (async () => {
    const out = await mkdtemp(path.join(tmpdir(), "fake-scanner-"))
    process.on("exit", () => rmSync(out, { recursive: true, force: true }))
    const entry = path.join(out, `${kind}.ts`)
    await Bun.write(entry, SOURCES[kind])
    const command = path.join(out, `${kind}.exe`)
    // A compiled executable would otherwise load the caller's bunfig.toml (and its test preload) at startup.
    const result = await Bun.build({
      entrypoints: [entry],
      compile: {
        outfile: command,
        autoloadBunfig: false,
        autoloadDotenv: false,
        autoloadTsconfig: false,
        autoloadPackageJson: false,
      },
    })
    if (!result.success) throw new Error(`fake ${kind} scanner did not compile: ${result.logs.join("\n")}`)
    return command
  })()
  compiled.set(kind, built)
  return built
}
