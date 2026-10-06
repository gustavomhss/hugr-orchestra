import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { DATAMODEL_CODEGEN, PYTHON } from "../src/backend-toolkit/hosted/python"
import { WHEELS } from "../src/backend-toolkit/hosted/python-wheels"

// The milestone-4 pins; changing one is a contract amendment.
const RELEASE = "20261003"
const runtimes = Object.entries(PYTHON.targets).map(([target, pin]) => ({ target, ...pin }))
const requirements = DATAMODEL_CODEGEN.install.kind === "pip" ? DATAMODEL_CODEGEN.install.requirements : ""
const lines = requirements.split("\n").filter((line) => line.length > 0)
const normalize = (name: string) => name.replace(/[-_.]+/g, "-").toLowerCase()

// The platform tags a target's CPython 3.13 accepts, as wheel filename platform components.
const PLATFORMS = {
  "darwin-arm64": /^macosx_\d+_\d+_(arm64|universal2)$/,
  "darwin-x64": /^macosx_\d+_\d+_(x86_64|universal2)$/,
  "linux-arm64": /^manylinux(2014|_\d+_\d+)_aarch64$/,
  "linux-x64": /^manylinux(2014|_\d+_\d+)_x86_64$/,
  "win32-x64": /^win_amd64$/,
}

describe("backend toolkit python runtime", () => {
  test("pins CPython 3.13 from the python-build-standalone release under PSF-2.0", () => {
    expect(PYTHON.id).toBe("python")
    expect(PYTHON.version).toMatch(/^3\.13\.\d+$/)
    expect(PYTHON.license).toBe("PSF-2.0")
    expect(PYTHON.upstream).toBe("astral-sh/python-build-standalone")
    expect(Object.keys(PYTHON.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
  })

  test("every target is a distinct install_only archive of the pinned release with a sha256 SRI digest", () => {
    for (const pin of runtimes) {
      const url = new URL(pin.artifact.url)
      expect(url.protocol, pin.artifact.url).toBe("https:")
      expect(url.hostname, pin.artifact.url).toBe("github.com")
      expect(url.pathname).toStartWith(`/${PYTHON.upstream}/releases/download/${RELEASE}/`)
      expect(decodeURIComponent(url.pathname)).toEndWith("-install_only.tar.gz")
      expect(decodeURIComponent(url.pathname)).toContain(`/cpython-${PYTHON.version}+${RELEASE}-`)
      expect(decodeURIComponent(url.pathname)).not.toContain("freethreaded")
      expect(decodeURIComponent(url.pathname)).not.toContain("musl")
      expect(pin.artifact.format).toBe("tar.gz")
      const match = /^sha256-([A-Za-z0-9+/]+={0,2})$/.exec(pin.artifact.integrity)
      expect(match, pin.artifact.url).not.toBeNull()
      expect(Buffer.from(match![1], "base64").length).toBe(32)
    }
    expect(new Set(runtimes.map((pin) => pin.artifact.integrity)).size).toBe(runtimes.length)
    expect(new Set(runtimes.map((pin) => pin.artifact.url)).size).toBe(runtimes.length)
  })

  test("each archive installs its whole python/ tree and the interpreter at the contract path", () => {
    for (const pin of runtimes) {
      const entries = pin.artifact.entries
      for (const entry of entries) expect(entry.from, pin.artifact.url).toBe(`python/${entry.to}`)
      expect(entries.map((entry) => entry.to).filter((name) => name.endsWith(".pdb"))).toEqual([])
      if (pin.target === "win32-x64") {
        expect(pin.executable).toBe("python.exe")
        expect(entries.find((entry) => entry.to === "python.exe")?.executable).toBe(true)
        expect(entries.map((entry) => entry.to)).toEqual(
          expect.arrayContaining(["DLLs", "Lib", "python313.dll", "vcruntime140.dll", "LICENSE.txt"]),
        )
        continue
      }
      expect(pin.executable).toBe("bin/python3")
      expect(entries.map((entry) => entry.to)).toEqual(["bin", "include", "lib", "share"])
    }
  })
})

describe("backend toolkit datamodel-codegen", () => {
  test("pins datamodel-code-generator 0.83.0 as a pip install run as a module of the python runtime", () => {
    expect(DATAMODEL_CODEGEN.id).toBe("datamodel-codegen")
    expect(DATAMODEL_CODEGEN.version).toBe("0.83.0")
    expect(DATAMODEL_CODEGEN.license).toBe("MIT")
    expect(DATAMODEL_CODEGEN.upstream).toBe("koxudaxi/datamodel-code-generator")
    expect(DATAMODEL_CODEGEN.runtime).toBe("python")
    expect(DATAMODEL_CODEGEN.install.kind).toBe("pip")
    expect(DATAMODEL_CODEGEN.launch).toEqual(["-m", "datamodel_code_generator"])
    expect(DATAMODEL_CODEGEN.env).toMatchObject({ PYTHONPATH: "{install}", PYTHONSAFEPATH: "1" })
  })

  test("requirements pin every package exactly once with sha256 hashes only", () => {
    const parsed = lines.map((line) => /^([A-Za-z0-9._-]+)==(\S+)((?: --hash=sha256:[0-9a-f]{64})+)$/.exec(line))
    for (const [index, match] of parsed.entries()) expect(match, lines[index]).not.toBeNull()
    const names = parsed.map((match) => normalize(match![1]))
    expect(new Set(names).size).toBe(names.length)
    expect(lines.some((line) => line.startsWith(`datamodel-code-generator==${DATAMODEL_CODEGEN.version} `))).toBe(true)
    expect(names).toEqual(expect.arrayContaining(["pydantic", "pydantic-core", "black", "isort", "jinja2", "pyyaml"]))
    const hashes = lines.flatMap((line) => [...line.matchAll(/--hash=sha256:([0-9a-f]{64})/g)].map((match) => match[1]))
    expect(new Set(hashes).size).toBe(hashes.length)
  })

  test("requirements carry exactly the hashes of the pinned wheel table", () => {
    expect(lines).toHaveLength(Object.keys(WHEELS).length)
    for (const [pin, wheels] of Object.entries(WHEELS)) {
      const line = lines.find((candidate) => candidate.startsWith(`${pin} `))
      expect(line, pin).toBeDefined()
      expect([...line!.matchAll(/sha256:([0-9a-f]{64})/g)].map((match) => match[1]).sort()).toEqual(
        Object.values(wheels).sort(),
      )
      const [name, version] = pin.split("==")
      for (const file of Object.keys(wheels)) {
        const parts = file.slice(0, -".whl".length).split("-")
        expect(file, pin).toEndWith(".whl")
        expect(normalize(parts[0]), file).toBe(normalize(name))
        expect(parts[1], file).toBe(version)
      }
    }
  })

  test("every package has a hashed wheel each target's CPython 3.13 can install, and no wheel no target can", () => {
    const compatible = (file: string, target: keyof typeof PLATFORMS) => {
      const [python, abi, platform] = file.slice(0, -".whl".length).split("-").slice(-3)
      if (python.split(".").includes("py3") && abi === "none" && platform === "any") return true
      if (python !== "cp313" || !["cp313", "abi3"].includes(abi)) return false
      return platform.split(".").some((tag) => PLATFORMS[target].test(tag))
    }
    for (const [pin, wheels] of Object.entries(WHEELS)) {
      for (const target of BackendToolkitTarget.TARGETS)
        expect(Object.keys(wheels).some((file) => compatible(file, target)), `${pin} on ${target}`).toBe(true)
      for (const file of Object.keys(wheels))
        expect(BackendToolkitTarget.TARGETS.some((target) => compatible(file, target)), file).toBe(true)
    }
  })
})
