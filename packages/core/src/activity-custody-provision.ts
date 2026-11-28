export * as ActivityCustodyProvision from "./activity-custody-provision"

import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, opendir } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Project } from "@orchestra/schema/project"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivityApplyTable } from "./activity-apply.sql"
import { ActivityArmTable } from "./activity-arm.sql"
import type { Database } from "./database/database"
import type { AppProcess } from "./process"
import { ProjectDirectoryTable, ProjectTable } from "./project/sql"
import { AbsolutePath } from "./schema"

const component = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/))
const Manifest = Schema.Array(Schema.Struct({
  projectID: Project.ID.check(Schema.isPattern(/^[^\u0000-\u001f\u007f]{1,128}$/)),
  repository: component,
  worktree: component,
}))
const decodeManifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest), { onExcessProperty: "error" })
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
const readOnly = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const gitPath = "/usr/bin/git"
const gitEnv = {
  PATH: "/usr/bin:/bin",
  LC_ALL: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_ATTR_NOSYSTEM: "1",
  GIT_ALLOW_PROTOCOL: "",
  GIT_NO_LAZY_FETCH: "1",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_TERMINAL_PROMPT: "0",
}

export const read = Effect.fn("ActivityCustodyProvision.read")(function* (root: string, processService: AppProcess.Interface) {
  const manifest = yield* Effect.tryPromise(async () => {
    await requireDirectory(path.join(root, "repositories"))
    await requireDirectory(path.join(root, "worktrees"))
    return decodeManifest(await readProtectedFile(path.join(root, "registrations.json"), 16 * 1024))
  })
  if (manifest.length > 8 || new Set(manifest.map((item) => item.worktree)).size !== manifest.length)
    return yield* Effect.fail(new Error("Activity custody registrations require at most eight distinct worktrees"))

  const repositories = new Map<string, string>()
  const authorized = new Map<string, { gitDir: string; common: string }>()
  const registrations = yield* Effect.forEach(manifest, (item) => Effect.gen(function* () {
    const repository = AbsolutePath.make(path.join(root, "repositories", item.repository))
    const worktree = AbsolutePath.make(path.join(root, "worktrees", item.worktree))
    const common = path.join(repository, ".git")
    const previous = repositories.get(item.projectID)
    if ((previous && previous !== repository) || [...repositories].some(([id, dir]) => id !== item.projectID && dir === repository))
      return yield* Effect.fail(new Error("Activity custody project identifiers must identify one repository each"))
    if (path.join(worktree, "node_modules").length > 384)
      return yield* Effect.fail(new Error("Activity custody worktree path exceeds the supported target length"))

    if (!previous) {
      yield* Effect.tryPromise(async () => {
        const info = await requireDirectory(repository)
        await verifyMetadata(common, info.dev)
        await readProtectedFile(path.join(common, "config"), 64 * 1024)
      })
      // Parse Git's own config syntax with includes disabled before Git opens the repository.
      const config = yield* processService.run(ChildProcess.make(gitPath, [
        "config", "--no-includes", "--file", path.join(common, "config"), "--null", "--name-only", "--list",
      ], { cwd: root, env: gitEnv, extendEnv: false, stdin: "ignore" }), {
        timeout: "2 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024,
      })
      const keys = config.stdout.toString("utf8")
      if (config.exitCode !== 0 || config.stdoutTruncated || config.stderr.length || config.stderrTruncated ||
        (keys && !keys.endsWith("\0")) || keys.split("\0").slice(0, -1).some((key) => !safeGitConfig(key)))
        return yield* Effect.fail(new Error("Activity custody repository configuration contains unsupported settings"))
      repositories.set(item.projectID, repository)
    }

    const admin = yield* Effect.tryPromise(async () => {
      await requireDirectory(worktree)
      const dotGit = path.join(worktree, ".git")
      const link = /^gitdir: ([^\r\n]+)\n?$/.exec(await readProtectedFile(dotGit, 4096))?.[1]
      const admin = link && path.resolve(worktree, link)
      const adminRoot = path.join(common, "worktrees")
      if (!admin || path.dirname(admin) !== adminRoot || (link !== admin && link !== path.relative(worktree, admin)))
        throw new Error("Activity custody worktree metadata must be in its registered repository")
      const commonDir = (await readProtectedFile(path.join(admin, "commondir"), 4096)).replace(/\n$/, "")
      const gitDir = (await readProtectedFile(path.join(admin, "gitdir"), 4096)).replace(/\n$/, "")
      if ((commonDir !== common && commonDir !== path.relative(admin, common)) ||
        (gitDir !== dotGit && gitDir !== path.relative(admin, dotGit)))
        throw new Error("Activity custody Git metadata links do not match the registered worktree")
      return admin
    })
    authorized.set(repository, { gitDir: common, common })
    authorized.set(worktree, { gitDir: admin, common })
    return {
      projectID: item.projectID, repository, worktree,
      registrationID: createHash("sha256").update(JSON.stringify([item.projectID, item.repository, item.worktree])).digest("hex"),
    }
  }))

  // Bind inspection commands to the provisioned worktree and Git metadata before executing them as root.
  const git: AppProcess.Interface = {
    ...processService,
    run(command, options) {
      if (command._tag !== "StandardCommand" || command.command !== "git" || typeof command.options.cwd !== "string")
        return Effect.die(new Error("Unregistered activity custody Git operation"))
      const cwd = command.options.cwd
      const binding = authorized.get(cwd)
      if (!binding) return Effect.die(new Error("Unregistered activity custody Git operation"))
      return processService.run(ChildProcess.make(gitPath, [
        `--git-dir=${binding.gitDir}`, `--work-tree=${cwd}`,
        "-c", "core.hooksPath=/dev/null", "-c", "core.attributesFile=/dev/null", "-c", "core.excludesFile=/dev/null", ...command.args,
      ], { cwd, env: { ...gitEnv, GIT_COMMON_DIR: binding.common }, extendEnv: false, stdin: "ignore" }), options)
    },
  }
  return { registrations, git }
})

type Registrations = Effect.Success<ReturnType<typeof read>>["registrations"]

export function install(database: Database.Interface, registrations: Registrations) {
  return database.db.transaction((tx) => Effect.gen(function* () {
    const projects = Array.from(new Map(registrations.map((item) => [item.projectID, {
      id: item.projectID, worktree: item.repository, vcs: "git", sandboxes: [],
    }])).values())
    const directories = registrations.map((item) => ({
      project_id: item.projectID, directory: item.worktree, registration_id: item.registrationID,
      strategy: "git_worktree", type: "git_worktree" as const,
    }))
    const savedProjects = yield* tx.select().from(ProjectTable).all()
    const savedDirectories = yield* tx.select().from(ProjectDirectoryTable).all()
    if (savedProjects.length === projects.length && savedDirectories.length === directories.length &&
      projects.every((item) => savedProjects.some((saved) => saved.id === item.id &&
        saved.worktree === item.worktree && saved.vcs === item.vcs)) &&
      directories.every((item) => savedDirectories.some((saved) => saved.project_id === item.project_id &&
        saved.directory === item.directory && saved.registration_id === item.registration_id &&
        saved.strategy === item.strategy && saved.type === item.type))) return

    if ((yield* tx.select().from(ActivityActionLedgerTable).limit(1).get()) ||
      (yield* tx.select().from(ActivityArmTable).limit(1).get()) ||
      (yield* tx.select().from(ActivityApplyTable).limit(1).get()))
      return yield* Effect.fail(new Error("Activity custody manifest differs from registrations with durable evidence"))
    yield* tx.delete(ProjectDirectoryTable).run()
    yield* tx.delete(ProjectTable).run()
    if (projects.length) yield* tx.insert(ProjectTable).values(projects).run()
    if (directories.length) yield* tx.insert(ProjectDirectoryTable).values(directories).run()
  }), { behavior: "immediate" })
}

async function requireDirectory(file: string) {
  const info = await lstat(file)
  if (!info.isDirectory() || info.uid !== 0 || (info.mode & 0o077) !== 0)
    throw new Error("Unprotected activity custody directory: " + file)
  return info
}

async function readProtectedFile(file: string, limit: number) {
  const handle = await open(file, readOnly)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== 0 || (info.mode & 0o022) !== 0 || info.nlink !== 1 || info.size > limit)
      throw new Error("Unprotected activity custody file: " + file)
    const data = Buffer.alloc(info.size + 1)
    let offset = 0
    while (offset < data.length) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, null)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== info.size) throw new Error("Activity custody file changed while reading: " + file)
    return decoder.decode(data.subarray(0, offset))
  } finally {
    await handle.close()
  }
}

async function verifyMetadata(common: string, device: number) {
  const root = await lstat(common)
  if (!root.isDirectory()) throw new Error("Activity custody repository must contain its Git metadata")
  const pending = [common]
  while (pending.length) {
    const file = pending.pop()!
    const info = await lstat(file)
    if (info.uid !== 0 || (info.mode & 0o022) !== 0 || info.dev !== device ||
      (!info.isDirectory() && (!info.isFile() || info.nlink !== 1)))
      throw new Error("Unprotected activity custody Git metadata: " + file)
    if (info.isDirectory()) {
      const entries = await opendir(file)
      for await (const entry of entries) {
        if (entry.name.includes("\uFFFD") || entry.name === "config.worktree" ||
          (file === common && entry.name === "commondir") ||
          (file === path.join(common, "objects", "info") && ["alternates", "http-alternates"].includes(entry.name)))
          throw new Error("Unsupported activity custody Git metadata")
        pending.push(path.join(file, entry.name))
      }
    }
  }
}

function safeGitConfig(key: string) {
  return /^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|symlinks|precomposeunicode)|extensions\.objectformat|remote\..+\.(?:url|fetch)|branch\..+\.(?:remote|merge))$/.test(key)
}
