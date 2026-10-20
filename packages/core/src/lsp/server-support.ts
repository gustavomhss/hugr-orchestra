import path from "path"
import os from "os"
import { Global } from "@orchestra/core/global"
import { text } from "node:stream/consumers"
import fs from "fs/promises"
import { FSUtil } from "../fs-util"
import { AppProcess } from "../process"
import { ChildProcess } from "effect/unstable/process"
import { Effect } from "effect"
import { LayerNode } from "../effect/layer-node"
import { which } from "@orchestra/core/util/which"
import { Module } from "@orchestra/core/util/module"
import { confined, type Child } from "./launch"
import { Npm } from "@orchestra/core/npm"


export type InstanceContext = { directory: string; worktree: string; project?: { id: string } }
export type RuntimeFlags = { experimentalLspTy?: boolean; disableLspDownload?: boolean }

export const exists = async (p: string) => {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}
export const readText = (p: string) => fs.readFile(p, "utf-8")
export const write = async (p: string, content: string | Buffer | Uint8Array, mode?: number) => {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content as any)
  try {
    await fs.writeFile(p, data)
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, data)
    } else {
      throw e
    }
  }
  if (mode) await fs.chmod(p, mode)
}
export const writeStream = async (p: string, body: any) => {
  const { createWriteStream } = await import("node:fs")
  const { pipeline } = await import("node:stream/promises")
  const { Readable } = await import("node:stream")
  await pipeline(Readable.fromWeb(body), createWriteStream(p))
}
export const findUp = async (target: string, start: string, stop?: string) => {
  const result: string[] = []
  let current = start
  while (true) {
    const search = path.join(current, target)
    if (await exists(search)) result.push(search)
    if (stop === current) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return result
}
export async function* up(options: { targets: string[]; start: string; stop?: string }) {
  let current = options.start
  while (true) {
    for (const target of options.targets) {
      const search = path.join(current, target)
      if (await exists(search)) yield search
    }
    if (options.stop === current) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}
export const extractZip = async (zip: string, dest: string) => {
  const result = await run(["unzip", "-o", zip, "-d", dest])
  return result.code === 0
}
export const pathExists = async (p: string) =>
  fs
    .stat(p)
    .then(() => true)
    .catch(() => false)
export const run = async (cmd: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
  const result = await Effect.runPromise(AppProcess.Service.use((app) => app.run(ChildProcess.make(cmd[0], cmd.slice(1), { cwd: opts.cwd, env: opts.env }))).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
  return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr }
}
export const output = async (cmd: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
  const result = await Effect.runPromise(AppProcess.Service.use((app) => app.run(ChildProcess.make(cmd[0], cmd.slice(1), { cwd: opts.cwd, env: opts.env }))).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
  return { code: result.exitCode, stdout: result.stdout, stderr: result.stderr, text: result.stdout.toString() }
}

export interface Handle {
  process: Child
  initialization?: Record<string, any>
}

export type RootFunction = (file: string, ctx: InstanceContext) => Promise<string | undefined>

export const NearestRoot = (includePatterns: string[], excludePatterns?: string[]): RootFunction => {
  return async (file, ctx) => {
    if (excludePatterns) {
      const excludedFiles = up({
        targets: excludePatterns,
        start: path.dirname(file),
        stop: ctx.directory,
      })
      const excluded = await excludedFiles.next()
      await excludedFiles.return()
      if (excluded.value) return undefined
    }
    const files = up({
      targets: includePatterns,
      start: path.dirname(file),
      stop: ctx.directory,
    })
    const first = await files.next()
    await files.return()
    if (!first.value) return ctx.directory
    return path.dirname(first.value)
  }
}

export const StrictNearestRoot = (includePatterns: string[], excludePatterns?: string[]): RootFunction => {
  return async (file, ctx) => {
    if (excludePatterns) {
      const excludedFiles = up({
        targets: excludePatterns,
        start: path.dirname(file),
        stop: ctx.directory,
      })
      const excluded = await excludedFiles.next()
      await excludedFiles.return()
      if (excluded.value) return undefined
    }
    const files = up({
      targets: includePatterns,
      start: path.dirname(file),
      stop: ctx.directory,
    })
    const first = await files.next()
    await files.return()
    if (!first.value) return undefined
    return path.dirname(first.value)
  }
}

export interface Info {
  id: string
  extensions: string[]
  global?: boolean
  root: RootFunction
  spawn(root: string, ctx: InstanceContext, flags: RuntimeFlags): Promise<Handle | undefined>
}
