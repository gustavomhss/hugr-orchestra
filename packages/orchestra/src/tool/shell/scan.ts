// The shell tool's approval scan: which commands a command line runs, which directories outside the instance it
// touches, and the permission asks for them. Shared by the shell tool and by engines that run shell commands
// themselves (Claude Code's Bash), so both ask the same questions.
import { Effect } from "effect"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { Language, type Node } from "web-tree-sitter"
import { FSUtil } from "@orchestra/core/fs-util"
import { Shell } from "@orchestra/core/shell"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { containsPath, type InstanceContext } from "../../project/instance-context"
import { InstanceState } from "@/effect/instance-state"
import { lazy } from "@/util/lazy"
import { BashArity } from "@/permission/arity"
import type { Tool } from "../tool"
import { ShellID } from "./id"

const CWD = new Set(["cd", "chdir", "popd", "pushd", "push-location", "set-location"])
const FILES = new Set([
  ...CWD,
  "rm",
  "cp",
  "mv",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "cat",
  // Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir
  // already hit the entries above, and alias normalization should happen in one
  // place later so we do not risk double-prompting.
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])
const CMD_FILES = new Set([
  "copy",
  "del",
  "dir",
  "erase",
  "md",
  "mkdir",
  "move",
  "rd",
  "ren",
  "rename",
  "rmdir",
  "type",
])
const FLAGS = new Set(["-destination", "-literalpath", "-path"])
const SWITCHES = new Set(["-confirm", "-debug", "-force", "-nonewline", "-recurse", "-verbose", "-whatif"])

type Part = {
  type: string
  text: string
  node: Node
}

type Scan = {
  dirs: Set<string>
  patterns: Set<string>
  always: Set<string>
}

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

function parts(node: Node) {
  const out: Part[] = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    if (child.type === "command_elements") {
      for (let j = 0; j < child.childCount; j++) {
        const item = child.child(j)
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
        out.push({ type: item.type, text: item.text, node: item })
      }
      continue
    }
    if (
      child.type !== "command_name" &&
      child.type !== "command_name_expr" &&
      child.type !== "word" &&
      child.type !== "string" &&
      child.type !== "raw_string" &&
      child.type !== "concatenation"
    ) {
      continue
    }
    out.push({ type: child.type, text: child.text, node: child })
  }
  return out
}

function source(node: Node) {
  return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()
}

function commands(node: Node) {
  return node.descendantsOfType("command").filter((child): child is Node => Boolean(child))
}

function unquote(text: string) {
  if (text.length < 2) return text
  const first = text[0]
  const last = text[text.length - 1]
  if ((first === '"' || first === "'") && first === last) return text.slice(1, -1)
  return text
}

function home(text: string) {
  if (text === "~") return os.homedir()
  if (text.startsWith("~/") || text.startsWith("~\\")) return path.join(os.homedir(), text.slice(2))
  return text
}

function envValue(key: string) {
  if (process.platform !== "win32") return process.env[key]
  const name = Object.keys(process.env).find((item) => item.toLowerCase() === key.toLowerCase())
  return name ? process.env[name] : undefined
}

function auto(key: string, cwd: string, shell: string) {
  const name = key.toUpperCase()
  if (name === "HOME") return os.homedir()
  if (name === "PWD") return cwd
  if (name === "PSHOME") return path.dirname(shell)
}

function expand(text: string, cwd: string, shell: string) {
  const out = unquote(text)
    .replace(/\$\{env:([^}]+)\}/gi, (_, key: string) => envValue(key) || "")
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, key: string) => envValue(key) || "")
    .replace(/\$(HOME|PWD|PSHOME)(?=$|[\\/])/gi, (_, key: string) => auto(key, cwd, shell) || "")
  return home(out)
}

function provider(text: string) {
  const match = text.match(/^([A-Za-z]+)::(.*)$/)
  if (match) {
    if (match[1].toLowerCase() !== "filesystem") return
    return match[2]
  }
  const prefix = text.match(/^([A-Za-z]+):(.*)$/)
  if (!prefix) return text
  if (prefix[1].length === 1) return text
  return
}

function dynamic(text: string, ps: boolean) {
  if (text.startsWith("(") || text.startsWith("@(")) return true
  if (text.includes("$(") || text.includes("${") || text.includes("`")) return true
  if (ps) return /\$(?!env:)/i.test(text)
  return text.includes("$")
}

function prefix(text: string) {
  const match = /[?*[]/.exec(text)
  if (!match) return text
  if (match.index === 0) return
  return text.slice(0, match.index)
}

function pathArgs(list: Part[], ps: boolean, cmd = false) {
  if (!ps) {
    return list
      .slice(1)
      .filter(
        (item) =>
          !item.text.startsWith("-") &&
          !(cmd && item.text.startsWith("/")) &&
          !(list[0]?.text === "chmod" && item.text.startsWith("+")),
      )
      .map((item) => item.text)
  }

  const out: string[] = []
  let want = false
  for (const item of list.slice(1)) {
    if (want) {
      out.push(item.text)
      want = false
      continue
    }
    if (item.type === "command_parameter") {
      const flag = item.text.toLowerCase()
      if (SWITCHES.has(flag)) continue
      want = FLAGS.has(flag)
      continue
    }
    out.push(item.text)
  }
  return out
}

const parse = Effect.fn("ShellScan.parse")(function* (command: string, ps: boolean) {
  const tree = yield* Effect.promise(() => parser().then((p) => (ps ? p.ps : p.bash).parse(command)))
  if (!tree) throw new Error("Failed to parse command")
  return tree
})

const ask = Effect.fn("ShellScan.ask")(function* (ctx: Tool.Context, scan: Scan, input: { command: string }) {
  if (scan.dirs.size > 0) {
    const directories = Array.from(scan.dirs)
    const globs = directories.map((dir) => {
      if (process.platform === "win32") return FSUtil.normalizePathPattern(path.join(dir, "*"))
      return path.join(dir, "*")
    })
    yield* ctx.ask({
      permission: "external_directory",
      patterns: globs,
      always: globs,
      metadata: {
        command: input.command,
        directories,
        patterns: globs,
      },
    })
  }

  if (scan.patterns.size === 0) return
  yield* ctx.ask({
    permission: ShellID.ToolID,
    patterns: Array.from(scan.patterns),
    always: Array.from(scan.always),
    metadata: {
      command: input.command,
    },
  })
})

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const { default: psWasm } = await import("tree-sitter-powershell/tree-sitter-powershell.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const psPath = resolveWasm(psWasm)
  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)])
  const bash = new Parser()
  bash.setLanguage(bashLanguage)
  const ps = new Parser()
  ps.setLanguage(psLanguage)
  return { bash, ps }
})

const cygpath = Effect.fn("ShellScan.cygpath")(function* (shell: string, text: string) {
  const spawner = yield* ChildProcessSpawner
  const lines = yield* spawner
    .lines(ChildProcess.make(shell, ["-lc", 'cygpath -w -- "$1"', "_", text]))
    .pipe(Effect.catch(() => Effect.succeed([] as string[])))
  const file = lines[0]?.trim()
  if (!file) return
  return FSUtil.normalizePath(file)
})

export const resolvePath = Effect.fn("ShellScan.resolvePath")(function* (text: string, root: string, shell: string) {
  if (process.platform === "win32") {
    if (Shell.posix(shell) && text.startsWith("/") && FSUtil.windowsPath(text) === text) {
      const file = yield* cygpath(shell, text)
      if (file) return file
    }
    return FSUtil.normalizePath(path.resolve(root, FSUtil.windowsPath(text)))
  }
  return path.resolve(root, text)
})

const argPath = Effect.fn("ShellScan.argPath")(function* (arg: string, cwd: string, ps: boolean, shell: string) {
  const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))
  const file = text && prefix(text)
  if (!file || dynamic(file, ps)) return
  const next = ps ? provider(file) : file
  if (!next) return
  return yield* resolvePath(next, cwd, shell)
})

const collect = Effect.fn("ShellScan.collect")(function* (
  root: Node,
  cwd: string,
  ps: boolean,
  shell: string,
  instance: InstanceContext,
) {
  const fs = yield* FSUtil.Service
  const scan: Scan = {
    dirs: new Set<string>(),
    patterns: new Set<string>(),
    always: new Set<string>(),
  }
  const shellKind = ShellID.toKind(Shell.name(shell))

  for (const node of commands(root)) {
    const command = parts(node)
    const tokens = command.map((item) => item.text)
    const cmd = ps || shellKind === "cmd" ? tokens[0]?.toLowerCase() : tokens[0]

    if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
      for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
        const resolved = yield* argPath(arg, cwd, ps, shell)
        yield* Effect.logInfo("resolved path", { arg, resolved })
        if (!resolved || containsPath(resolved, instance)) continue
        const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
        scan.dirs.add(dir)
      }
    }

    if (tokens.length && (!cmd || !CWD.has(cmd))) {
      scan.patterns.add(source(node))
      scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
    }
  }

  return scan
})

/** Ask every permission the command line needs before it runs: directories outside the instance, then the commands. */
export const approve = Effect.fn("ShellScan.approve")(function* (
  ctx: Tool.Context,
  input: { command: string; cwd: string; shell: string },
) {
  const instance = yield* InstanceState.context
  const ps = Shell.ps(input.shell)
  yield* Effect.scoped(
    Effect.gen(function* () {
      const tree = yield* Effect.acquireRelease(parse(input.command, ps), (tree) => Effect.sync(() => tree.delete()))
      const scan = yield* collect(tree.rootNode, input.cwd, ps, input.shell, instance)
      if (!containsPath(input.cwd, instance)) scan.dirs.add(input.cwd)
      yield* ask(ctx, scan, input)
    }),
  )
})

/** Literal argv for a single owned OpenAPI shim call. Shell composition/wrappers are deliberately unsupported. */
export const ownedToolArgv = Effect.fn("ShellScan.ownedToolArgv")(function* (input: {
  command: string
  shell: string
  toolkitBin: string
}) {
  const ps = Shell.ps(input.shell)
  return yield* Effect.scoped(Effect.gen(function* () {
    const original = yield* Effect.acquireRelease(parse(input.command, ps), (tree) => Effect.sync(() => tree.delete()))
    // The shipped PowerShell grammar stops at an unquoted native --flag=value. Replace only '=' immediately
    // following its parsed command_parameter, then require a clean parse and an adjacent literal value below.
    const equals = new Set<number>()
    let tree = original
    while (ps) {
      const next = tree.rootNode.descendantsOfType("command_parameter")
        .filter((node): node is Node => node !== null && input.command[node.endIndex] === "=" && !equals.has(node.endIndex))
      if (!next.length) break
      next.forEach((node) => equals.add(node.endIndex))
      // Each pass exposes later parameters. One-character edits preserve all original argv offsets.
      tree = yield* Effect.acquireRelease(parse([...equals].reduce((text, index) =>
        text.slice(0, index) + " " + text.slice(index + 1), input.command), ps), (tree) => Effect.sync(() => tree.delete()))
    }
    const list = commands(tree.rootNode)
    const owned = list.filter((node) => {
      const name = parts(node)[0]?.node
      const value = name && literalArg(name, ps, true)
      return ownedExecutable(value, ps, input.toolkitBin)
    })
    // Variable nodes, not CLI prose, identify unbound owned executable expressions.
    const mentions = list.some((node) => {
      const command = parts(node)
      const name = command[0] && literalArg(command[0].node, ps)
      // Executor wrappers are a bounded grammar fence; echo/printf operands remain data.
      const wrapper = name !== undefined && ["env", "command", "exec", "nice", "nohup", "timeout", "sudo"]
        .includes(path.basename(name).toLowerCase())
      return (wrapper ? command : command.slice(0, 1)).some((part) => {
        const value = literalArg(part.node, ps, true)
        return ownedExecutable(value, ps, input.toolkitBin) ||
          value?.startsWith("\0toolkit") && value.toLowerCase().includes("openapi-generator") ||
          (value === undefined && part.node.descendantsOfType(["simple_expansion", "expansion", "variable", "braced_variable"])
            .some((child) => child?.text.toUpperCase().includes("BACKEND_TOOLKIT_BIN")))
      })
    })
    if (!owned.length) return mentions ? { blocked: "engine-project-version:unsupported-owned-call" } : { calls: [] }
    if (list.some((node) => CWD.has(unquote(parts(node)[0]?.text ?? "").toLowerCase())))
      return { blocked: "engine-project-version:unbound-cwd" }
    if (tree.rootNode.hasError || owned.length !== 1)
      return { blocked: "engine-project-version:unsupported-owned-call" }
    const node = owned[0]
    const wrappers = new Set(["program", "pipeline", "pipeline_chain", "statement_list", "script_block", "script_block_body"])
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (!wrappers.has(parent.type) || parent.namedChildren.filter((child) => child?.type !== "comment").length !== 1)
        return { blocked: "engine-project-version:unsupported-owned-call" }
    }
    if (node.descendantsOfType(["variable_assignment", "redirection", "file_redirect", "herestring_redirect", "stop_parsing"] ).length ||
      (ps && node.children.some((child) => child?.type === "command_invokation_operator" && child.text !== "&")))
      return { blocked: "engine-project-version:unsupported-owned-call" }
    const args = (ps ? parts(node).slice(1).map((part) => part.node) : node.childrenForFieldName("argument"))
      .filter((child): child is Node => child !== null)
    const argv: string[] = []
    const bound = new Set<number>()
    for (let i = 0; i < args.length; i++) {
      const value = literalArg(args[i], ps)
      if (value === undefined) return { blocked: "engine-project-version:unbound-args" }
      if (ps && i > 0 && equals.has(args[i - 1].endIndex) && args[i - 1].endIndex + 1 === args[i].startIndex) {
        argv[argv.length - 1] += `=${value}`
        bound.add(args[i - 1].endIndex)
        continue
      }
      if (ps && i > 0 && args[i - 1].endIndex === args[i].startIndex) {
        argv[argv.length - 1] += value
        continue
      }
      argv.push(value)
    }
    if (bound.size !== equals.size) return { blocked: "engine-project-version:unbound-args" }
    if (list.length !== 1) return { blocked: "engine-project-version:unsupported-owned-call" }
    return { calls: [{ engine: "openapi-generator" as const, argv }] }
  }))
})

function ownedExecutable(value: string | undefined, ps: boolean, toolkitBin: string) {
  if (value === undefined) return false
  if (value === "\0toolkit/openapi-generator" || (ps && ["\0toolkit\\openapi-generator.cmd", "\0toolkit/openapi-generator.cmd"].includes(value))) return true
  const executable = path.join(toolkitBin, process.platform === "win32" ? "openapi-generator.cmd" : "openapi-generator")
  return process.platform === "win32" ? path.normalize(value).toLowerCase() === executable.toLowerCase() : path.normalize(value) === executable
}

function literalArg(node: Node, ps: boolean, executable = false): string | undefined {
  if (executable && ["$BACKEND_TOOLKIT_BIN", "${BACKEND_TOOLKIT_BIN}", "$env:BACKEND_TOOLKIT_BIN", "${env:BACKEND_TOOLKIT_BIN}"].includes(node.text))
    return "\0toolkit"
  if (["raw_string", "verbatim_string_characters"].includes(node.type))
    return ps ? unquote(node.text).replaceAll("''", "'") : unquote(node.text)
  if (["word", "string_content", "generic_token", "command_parameter", "path_command_name_token", "command_name"].includes(node.type) && node.namedChildCount === 0) {
    if (["$", "`", "*", "?", "[", "]", "{", "}", "~", '"', "'"].some((char) => node.text.includes(char)) ||
      (!ps && node.text.includes("\\"))) return undefined
    return node.text
  }
  if (["string", "expandable_string_literal", "concatenation", "path_command_name"].includes(node.type)) {
    if ((node.type === "string" || node.type === "expandable_string_literal") &&
      !node.namedChildren.length) {
      const text = unquote(node.text)
      return (["$", "`", '"'].some((char) => text.includes(char)) || (!ps && text.includes("\\"))) ? undefined : text
    }
    const values = node.namedChildren.map((child) => child ? literalArg(child, ps, executable) : undefined)
    if (values.some((value) => value === undefined)) return undefined
    if (ps && node.type === "expandable_string_literal") {
      // PowerShell's unlabelled string segments must be literal too; only the toolkit expansion is bound.
      const text = unquote(node.text)
      const expansion = node.namedChildren[0]
      if (!executable || values.length !== 1 || values[0] !== "\0toolkit" || !expansion || !text.startsWith(expansion.text)) return undefined
      const suffix = text.slice(expansion.text.length)
      return ["/openapi-generator", "\\openapi-generator.cmd", "/openapi-generator.cmd"].includes(suffix) ? `\0toolkit${suffix}` : undefined
    }
    return values.join("")
  }
  const child = node.namedChildren[0]
  if (node.namedChildCount === 1 && child?.text === node.text) return literalArg(child, ps, executable)
  return undefined
}

export * as ShellScan from "./scan"
