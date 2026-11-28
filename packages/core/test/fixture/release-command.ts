import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve, sep } from "node:path"
import type { Asset, Release, State } from "./release-promotion"
import { createHash } from "node:crypto"

// Executable protocol double only. No process spawn, network client, release orchestration or credential inheritance.
const directory = process.env.RELEASE_FIXTURE_ROOT
if (!directory) throw new Error("RELEASE_FIXTURE_ROOT_REQUIRED")
const filename = join(directory, "state.json")
const state = JSON.parse(await readFile(filename, "utf8")) as State
const tool = process.argv[2]
const args = process.argv.slice(3)
const save = async () => {
  await writeFile(`${filename}.pending`, JSON.stringify(state))
  await rename(`${filename}.pending`, filename)
}
const fail = (message: string): never => {
  if (tool === "gh" && args[0] === "api" && args.includes("--include")) {
    const status = /HTTP (\d{3})/.exec(message)?.[1] ?? "500"
    process.stdout.write(`HTTP/2.0 ${status} Fixture\n\n{}\n`)
  }
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
const confined = (file: string) => {
  const path = resolve(file)
  if (!path.startsWith(`${resolve(directory)}${sep}`)) throw new Error("FIXTURE_PATH_ESCAPED")
  return path
}
const value = (name: string) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const positionals = () => {
  const result: string[] = []
  const values = new Set([
    "--repo",
    "-R",
    "--json",
    "--jq",
    "--dir",
    "-D",
    "--pattern",
    "-p",
    "--title",
    "--notes",
    "--notes-file",
    "--target",
    "--method",
    "-X",
    "-f",
    "-F",
    "--field",
    "--raw-field",
    "-H",
    "--header",
  ])
  for (let index = 0; index < args.length; index++) {
    if (values.has(args[index])) {
      index++
      continue
    }
    if (args[index].startsWith("-")) continue
    result.push(args[index])
  }
  return result
}
const hold = async (operation: string) => {
  if (state.hold !== operation) return
  await save()
  process.stdout.write("RELEASE_FIXTURE_HELD\n")
  await new Promise<void>(() => {
    setInterval(() => {}, 1000)
  })
}
const operation = async <A>(name: string, mutation: boolean, body: () => A | Promise<A>) => {
  state.log.push({ operation: name, mutation, args })
  if (state.fault?.operation === name && state.fault.remaining > 0) {
    state.fault.remaining--
    await save()
    fail(`HTTP ${state.fault.status ?? 500} fixture injected failure ${name}`)
  }
  await save()
  const result = await body()
  await save()
  await hold(name)
  return result
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const asset = (name: string, bytes: Uint8Array): Asset => ({
  name,
  bytes: Buffer.from(bytes).toString("base64"),
  digest: `sha256:${digest(bytes)}`,
  size: bytes.byteLength,
  id: state.log.length + 1000,
})
const metadata = (release: Release) => ({
  id: release.id,
  tag_name: release.tag_name,
  body: release.body,
  draft: release.draft,
  assets: Object.values(release.assets).map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    digest:
      state.badDigest?.tag === release.tag_name &&
      state.badDigest.name === file.name &&
      (!state.badDigest.afterUpload ||
        state.log.some((entry) => entry.operation === `asset.upload:${release.tag_name}/${file.name}`))
        ? `sha256:${"0".repeat(64)}`
        : file.digest,
    browser_download_url: `https://github.com/${state.repository}/releases/download/${release.tag_name}/${file.name}`,
  })),
})
const output = (result: unknown) => {
  if (tool === "gh" && args[0] === "api" && args.includes("--include")) process.stdout.write("HTTP/2.0 200 OK\n\n")
  const query = value("--jq")
  if (query === ".assets[].name") {
    if (!result || typeof result !== "object" || !("assets" in result) || !Array.isArray(result.assets))
      throw new Error("FIXTURE_QUERY_SHAPE")
    process.stdout.write(result.assets.map((item: { name: string }) => item.name).join("\n") + "\n")
    return
  }
  if (query === ".object.sha") {
    if (!result || typeof result !== "object" || !("object" in result) || !result.object ||
        typeof result.object !== "object" || !("sha" in result.object) || typeof result.object.sha !== "string")
      throw new Error("FIXTURE_QUERY_SHAPE")
    process.stdout.write(`${result.object.sha}\n`)
    return
  }
  if (query) {
    if (!/^\.[A-Za-z_]+$/.test(query) || !result || typeof result !== "object")
      throw new Error(`FIXTURE_QUERY_UNSUPPORTED:${query}`)
    const field = Reflect.get(result, query.slice(1))
    process.stdout.write(`${typeof field === "string" ? field : JSON.stringify(field)}\n`)
    return
  }
  process.stdout.write(`${typeof result === "string" ? result : JSON.stringify(result)}\n`)
}
const getRelease = (tag: string) => state.releases[tag] ?? fail(`HTTP 404 release ${tag}`)
const upload = async (release: Release, file: string) => {
  const name = basename(file)
  if (release.assets[name]) {
    if (!args.includes("--clobber")) fail(`HTTP 422 asset exists ${name}`)
    await operation(`asset.delete:${release.tag_name}/${name}`, true, () => {
      delete release.assets[name]
    })
  }
  await operation(`asset.upload:${release.tag_name}/${name}`, true, async () => {
    release.assets[name] = asset(name, await readFile(confined(file)))
  })
}
const fields = () =>
  Object.fromEntries(
    args.flatMap((arg, index) =>
      ["-f", "-F", "--field", "--raw-field"].includes(arg) ? [args[index + 1].split(/=(.*)/s).slice(0, 2)] : [],
    ),
  )

if (tool === "sleep") {
  if (args.length !== 1 || args[0] !== "3") throw new Error(`FIXTURE_SLEEP_UNSUPPORTED:${JSON.stringify(args)}`)
  // This private static transport fixture records retry backoff without wall-clock network waiting.
  await operation("release.backoff:3", false, () => undefined)
} else if (tool === "npm") {
  if (args[0] === "view" && args[1] && ["dist.integrity", "version"].includes(args[2])) {
    const key = args[1]
    await operation(`npm.view:${key}`, false, () => {
      if (!state.npm[key]) fail(`E404 package ${key}`)
      const result = args[2] === "version" ? key.slice(key.lastIndexOf("@") + 1) : state.npm[key]
      process.stdout.write(`${args.includes("--json") ? JSON.stringify(result) : result}\n`)
    })
  } else if (args[0] === "publish" && args[1]) {
    const bytes = await readFile(confined(args[1]))
    const members = await new Bun.Archive(bytes).files()
    const entry = members.get("package/package.json")
    if (!entry) throw new Error("FIXTURE_PACKAGE_METADATA_MISSING")
    const pkg = JSON.parse(await entry.text()) as { name: string; version: string }
    const key = `${pkg.name}@${pkg.version}`
    await operation(`npm.publish:${key}`, true, () => {
      if (state.npm[key]) fail(`E409 immutable package ${key}`)
      state.npm[key] = `sha512-${createHash("sha512").update(bytes).digest("base64")}`
    })
  } else throw new Error(`FIXTURE_NPM_UNSUPPORTED:${JSON.stringify(args)}`)
} else if (tool === "gh" && args[0] === "api") {
  const method = value("--method") ?? value("-X") ?? "GET"
  const endpoint = positionals()[1]
  const path = endpoint?.startsWith("https://api.github.com/") ? endpoint.slice("https://api.github.com/".length) : endpoint
  const prefix = `repos/${state.repository}/`
  if (!path?.startsWith(prefix)) throw new Error(`FIXTURE_REPOSITORY_UNSUPPORTED:${path}`)
  const resource = path.slice(prefix.length)
  const input = fields()
  if (method === "GET" && resource === `git/ref/heads/release-${state.version}`)
    output(await operation(`branch.read:release-${state.version}`, false, () => ({
      object: { type: "commit", sha: state.frozenBranchSHA ?? state.sourceSha },
    })))
  else if (method === "GET" && resource.startsWith("compare/"))
    output(await operation(`compare:${resource}`, false, () => ({ status: "identical" })))
  else if (method === "GET" && resource.startsWith("actions/runs/")) {
    const id = Number(resource.slice("actions/runs/".length))
    const workflows: Record<number, string> = {
      11: "release-cli.yml",
      22: "release-desktop.yml",
      33: "distribution-bundle.yml",
      44: "test.yml",
    }
    if (!workflows[id]) throw new Error("FIXTURE_RUN_UNSUPPORTED")
    output(
      await operation(`run.read:${id}`, false, () => ({
        head_sha: state.sourceSha,
        head_repository: { full_name: state.repository },
        head_branch: `release-${state.version}`,
        path: `.github/workflows/${workflows[id]}`,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
      })),
    )
  } else if (method === "GET" && resource.startsWith("git/ref/tags/")) {
    const tag = resource.slice("git/ref/tags/".length)
    output(
      await operation(`tag.read:${tag}`, false, () => ({ object: state.tags[tag] ?? fail(`HTTP 404 tag ${tag}`) })),
    )
  } else if (method === "GET" && resource.startsWith("git/tags/")) {
    const sha = resource.slice("git/tags/".length)
    output(await operation(`tag.object.read:${sha}`, false, () => state.objects[sha] ?? fail(`HTTP 404 object ${sha}`)))
  } else if (method === "POST" && resource === "git/tags") {
    output(
      await operation(`tag.object.create:${input.tag}`, true, () => {
        const sha = digest(Buffer.from(input.tag + input.object + input.message)).slice(0, 40)
        state.objects[sha] = { tag: input.tag, object: { type: input.type, sha: input.object }, message: input.message }
        return { sha }
      }),
    )
  } else if (method === "POST" && resource === "git/refs") {
    const tag = input.ref.replace(/^refs\/tags\//, "")
    output(
      await operation(`tag.ref.create:${tag}`, true, () => {
        if (state.tags[tag]) fail("HTTP 422 tag already exists")
        state.tags[tag] = { type: "tag", sha: input.sha }
        return { ref: input.ref, object: state.tags[tag] }
      }),
    )
  } else if (method === "GET" && resource.startsWith("releases/tags/")) {
    const tag = resource.slice("releases/tags/".length)
    output(await operation(`release.read:${tag}`, false, () => metadata(getRelease(tag))))
  } else if (method === "GET" && /^releases\/\d+$/.test(resource)) {
    const release = Object.values(state.releases).find((item) => item.id === Number(resource.split("/")[1])) ??
      fail("HTTP 404 release id")
    output(await operation(`release.read:${release.tag_name}`, false, () => metadata(release)))
  } else if (method === "PATCH" && /^releases\/\d+$/.test(resource)) {
    const release =
      Object.values(state.releases).find((item) => item.id === Number(resource.split("/")[1])) ??
      fail("HTTP 404 release id")
    output(
      await operation(`release.edit:${release.tag_name}`, true, () => {
        if (input.body !== undefined) release.body = input.body
        return metadata(release)
      }),
    )
  } else throw new Error(`FIXTURE_GH_API_UNSUPPORTED:${method}:${resource}`)
} else if (tool === "gh" && args[0] === "release") {
  const positional = positionals()
  const action = positional[1]
  const tag = positional[2]
  if (!tag) throw new Error("FIXTURE_TAG_REQUIRED")
  if (action === "view")
    output(
      await operation(`release.read:${tag}`, false, () => {
        const release = getRelease(tag)
        const result = {
          apiUrl: `https://api.github.com/repos/${state.repository}/releases/${release.id}`,
          body: release.body,
          isDraft: release.draft,
          tagName: release.tag_name,
          assets: metadata(release).assets,
        }
        const selected = value("--json")?.split(",")
        if (!selected) return result
        if (selected.some((key) => !Object.hasOwn(result, key))) throw new Error("FIXTURE_JSON_FIELD_UNSUPPORTED")
        return Object.fromEntries(selected.map((key) => [key, Reflect.get(result, key)]))
      }),
    )
  else if (action === "download") {
    await operation(`release.download:${tag}`, false, async () => {
      const release = getRelease(tag)
      const outputDirectory = confined(value("--dir") ?? value("-D") ?? ".")
      await mkdir(outputDirectory, { recursive: true })
      const pattern = value("--pattern") ?? value("-p")
      const matches = Object.values(release.assets).filter((item) => !pattern || new Bun.Glob(pattern).match(item.name))
      if (!matches.length) fail("HTTP 404 matching artifact")
      for (const item of matches) await writeFile(join(outputDirectory, item.name), Buffer.from(item.bytes, "base64"))
    })
  } else if (action === "create") {
    await operation(`release.create:${tag}`, true, async () => {
      if (state.releases[tag]) fail("HTTP 422 release already exists")
      if (args.includes("--verify-tag") && !state.tags[tag]) fail("HTTP 404 verified tag")
      const body = value("--notes-file")
        ? await readFile(confined(value("--notes-file")!), "utf8")
        : (value("--notes") ?? "")
      const release: Release = {
        id: state.log.length + 200,
        tag_name: tag,
        body,
        draft: args.includes("--draft"),
        assets: {},
      }
      state.releases[tag] = release
      for (const file of positional.slice(3)) await upload(release, file)
    })
  } else if (action === "edit") {
    await operation(`release.edit:${tag}`, true, async () => {
      const release = getRelease(tag)
      if (args.includes("--draft=false")) release.draft = false
      if (value("--notes-file")) release.body = await readFile(confined(value("--notes-file")!), "utf8")
      if (value("--notes") !== undefined) release.body = value("--notes")!
    })
  } else if (action === "upload") {
    const release = getRelease(tag)
    for (const file of positional.slice(3)) await upload(release, file)
  } else if (action === "delete-asset") {
    const release = getRelease(tag)
    const name = positional[3]
    await operation(`asset.delete:${tag}/${name}`, true, () => {
      delete release.assets[name]
    })
  } else throw new Error(`FIXTURE_GH_RELEASE_UNSUPPORTED:${action}`)
} else throw new Error(`FIXTURE_TOOL_UNSUPPORTED:${tool}`)
