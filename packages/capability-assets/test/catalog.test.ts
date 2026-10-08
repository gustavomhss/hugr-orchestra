import { expect, test } from "bun:test"
import { CapabilityAssetCatalog } from "../src/catalog"
import { CapabilityAssetSources } from "../src/sources"

// Frozen ASSET-MAP approval oracle, independent of production metadata; these are not readiness checks.
const skills = [
  ["har-derived-api-client", "api-discovery"], ["google-workspace", "office-operations"],
  ["pdf", "document-pdf"], ["xlsx", "document-sheets"], ["github", "github-operations"],
  ["publish-site", "site-publish"], ["cloudflare-temporary-deploy", "edge-preview"],
  ["stripe-projects", "stack-provision"], ["watchers", "resource-watch"],
  ["notion", "notion-operations"], ["himalaya", "mail-operations"], ["mcporter", "mcp-client-build"],
] as const

test("closed catalog covers exactly A01..A32 with 12/12/8 source-qualified entries", () => {
  coverage(CapabilityAssetCatalog.all)
  expect(CapabilityAssetCatalog.all.filter((entry) => entry.kind === "skill")).toHaveLength(12)
  expect(CapabilityAssetCatalog.all.filter((entry) => entry.kind === "provider")).toHaveLength(12)
  expect(CapabilityAssetCatalog.all.filter((entry) => entry.kind === "native")).toHaveLength(8)
  CapabilityAssetCatalog.all.forEach((entry) => expect(entry.status).toBe("source-qualified"))
})

test("coverage checker rejects duplicate and dropped entries from the actual catalog", () => {
  expect(() => coverage([])).toThrow()
  expect(() => coverage(CapabilityAssetCatalog.all.slice(0, -1))).toThrow()
  expect(() => coverage([...CapabilityAssetCatalog.all.slice(0, -1), CapabilityAssetCatalog.all[0]])).toThrow()
})

test("skill rename mapping and reserved body destinations match the approval oracle", () => {
  expect(CapabilityAssetCatalog.all.filter((entry) => entry.kind === "skill").map((entry) => [
    entry.originalName, entry.skillName,
  ])).toEqual(skills.map((pair) => [...pair]))
  CapabilityAssetCatalog.all.filter((entry) => entry.kind === "skill").forEach((entry) => {
    expect(entry.bodyName).toBe(entry.skillName)
    expect(entry.destination).toBe(`assets/skills/${entry.skillName}/SKILL.md`)
  })
})

test("canonical provider and native identifiers match ASSET-MAP", () => {
  expect(CapabilityAssetCatalog.all.filter((entry) => entry.kind === "provider").map((entry) => [
    entry.originalName, ...entry.nativeNames,
  ])).toEqual([
    ["cloudflare", "platform.cloudflare"], ["supabase", "platform.supabase"], ["vercel", "platform.vercel"],
    ["neon", "platform.neon"], ["railway", "platform.railway"], ["sentry", "platform.sentry"],
    ["grafana", "platform.grafana"], ["globalping", "platform.globalping"], ["linear", "platform.linear"],
    ["stripe", "platform.stripe"], ["netlify", "platform.netlify"], ["prisma-postgres", "platform.prisma-postgres"],
  ])
  expect(CapabilityAssetCatalog.all.filter((entry) => entry.kind === "native").map((entry) => [
    entry.originalName, ...entry.nativeNames,
  ])).toEqual([
    ["message", "channel_read", "channel_send", "channel_update"], ["image_generate", "image_create"],
    ["video_generate", "video_create"], ["show_widget", "artifact_show"], ["pdf", "document_read"],
    ["onepassword", "vault_list", "vault_bind"], ["process_manage", "process_control"],
    ["cronjob_manage", "schedule_manage"],
  ])
})

test("positive pinned upstream controls A01 and A32 retain actual source paths", () => {
  expect(CapabilityAssetCatalog.all.find((entry) => entry.id === "A01")?.upstream.paths).toEqual([
    "optional-skills/web-development/har-derived-api-client/SKILL.md",
  ])
  expect(CapabilityAssetCatalog.all.find((entry) => entry.id === "A32")?.upstream.paths).toEqual([
    "tools/cronjob_tools.py",
  ])
  expect(CapabilityAssetSources.hermes.SHA).toBe("134e08ca6d272c9b9610ce5889e2ecff9c73adf0")
  expect(CapabilityAssetSources.openclaw.SHA).toBe("2a305612539ccbb63a19b2030a05158dddd42a64")
})

test("all source and destination references are explicit, relative, and pinned", () => {
  expect(new Set(CapabilityAssetCatalog.all.map((entry) => entry.destination)).size).toBe(32)
  CapabilityAssetCatalog.all.forEach((entry) => {
    relative(entry.destination)
    expect(entry.nativeNames.length).toBeGreaterThan(0)
    const sources = [entry.upstream, ...("additionalUpstreams" in entry ? entry.additionalUpstreams : [])]
    sources.forEach((source) => {
      expect(source.SHA).toMatch(/^[a-f0-9]{40}$/)
      const pin = source.repository === CapabilityAssetSources.hermes.repository
        ? CapabilityAssetSources.hermes : CapabilityAssetSources.openclaw
      expect(source.repository).toBe(pin.repository)
      expect(source.SHA).toBe(pin.SHA)
      expect(source.license).toBe("MIT")
      expect(source.paths.length).toBeGreaterThan(0)
      source.paths.forEach(relative)
    })
  })
})

test("primary source paths match the pinned source-tree approval evidence", () => {
  expect(CapabilityAssetCatalog.all.map((entry) => [...entry.upstream.paths])).toEqual([
    ["optional-skills/web-development/har-derived-api-client/SKILL.md"],
    ["skills/productivity/google-workspace/SKILL.md"], ["skills/productivity/pdf/SKILL.md"],
    ["skills/productivity/xlsx/SKILL.md"], ["skills/software-development/github/SKILL.md"],
    ["optional-skills/web-development/publish-site/SKILL.md"],
    ["optional-skills/web-development/cloudflare-temporary-deploy/SKILL.md"],
    ["optional-skills/payments/stripe-projects/SKILL.md"], ["optional-skills/devops/watchers/SKILL.md"],
    ["skills/notion/SKILL.md"], ["skills/himalaya/SKILL.md"], ["skills/mcporter/SKILL.md"],
    ["optional-mcps/cloudflare/manifest.yaml"], ["optional-mcps/supabase/manifest.yaml"],
    ["optional-mcps/vercel/manifest.yaml"], ["optional-mcps/neon/manifest.yaml"],
    ["optional-mcps/railway/manifest.yaml"], ["optional-mcps/sentry/manifest.yaml"],
    ["optional-mcps/grafana/manifest.yaml"], ["optional-mcps/globalping/manifest.yaml"],
    ["optional-mcps/linear/manifest.yaml"], ["optional-mcps/stripe/manifest.yaml"],
    ["optional-mcps/netlify/manifest.yaml"], ["optional-mcps/prisma-postgres/manifest.yaml"],
    ["src/channels/plugins/message-tool-api.ts", "extensions/slack/message-tool-api.ts", "extensions/discord/action-runtime-api.ts"],
    ["tools/image_generation_tool.py"], ["tools/video_generation_tool.py"], ["src/canvas/widget-tool.ts"],
    ["extensions/document-extract/document-extractor.ts", "extensions/document-extract/document-extractor.worker.ts"],
    ["extensions/onepassword/onepassword-secret-ref-resolver.js", "skills/1password/SKILL.md"],
    ["tools/process_registry.py", "tools/process_registry_results.py"], ["tools/cronjob_tools.py"],
  ])
  expect(CapabilityAssetCatalog.all.flatMap((entry) => "additionalUpstreams" in entry
    ? entry.additionalUpstreams.map((source) => [entry.id, ...source.paths]) : [])).toEqual([
    ["A05", "skills/github/SKILL.md"], ["A12", "optional-skills/mcp/mcporter/SKILL.md"],
    ["A26", "extensions/openai/image-generation-provider.ts"], ["A27", "extensions/runway/video-generation-provider.ts"],
  ])
})

test("provider presets cover the catalog and retain exact approved HTTPS endpoints", () => {
  expect(CapabilityAssetCatalog.providers.map((provider) => provider.assetID)).toEqual(
    CapabilityAssetCatalog.all.filter((entry) => entry.kind === "provider").map((entry) => entry.id),
  )
  expect(CapabilityAssetCatalog.providers.map((provider) => provider.endpoint)).toEqual([
    "https://mcp.cloudflare.com/mcp?codemode=false", "https://mcp.supabase.com/mcp", "https://mcp.vercel.com",
    "https://mcp.neon.tech/mcp", "https://mcp.railway.com", "https://mcp.sentry.dev/mcp",
    "https://mcp.grafana.com/mcp", "https://mcp.globalping.dev/mcp", "https://mcp.linear.app/mcp",
    "https://mcp.stripe.com", "https://netlify-mcp.netlify.app/mcp", "https://mcp.prisma.io/mcp",
  ])
  CapabilityAssetCatalog.providers.forEach((provider) => {
    const url = new URL(provider.endpoint)
    expect(url.protocol).toBe("https:")
    expect(url.username + url.password + url.hash).toBe("")
    expect(provider.auth).toBe("oauth")
    expect(provider.transport).toBe("http")
    expect(new Set(provider.defaultExcluded).size).toBe(provider.defaultExcluded.length)
  })
  expect(CapabilityAssetCatalog.providers.find((provider) => provider.assetID === "A17")?.defaultExcluded).toEqual(["railway-agent"])
  expect(CapabilityAssetCatalog.providers.find((provider) => provider.assetID === "A19")?.defaultExcluded).toEqual(["ask_assistant", "agento11y_*"])
})

test("catalog has no auth-secret fields, with a positive scanner control", () => {
  const data = [CapabilityAssetCatalog.all, CapabilityAssetCatalog.providers, CapabilityAssetSources.manifest]
  expect(() => publicData({ clientSecret: "synthetic-private-value" })).toThrow("clientSecret")
  publicData(data)
})

test("notices contain verbatim license copies and the package has data-only exports", async () => {
  const notices = await Bun.file(new URL("../NOTICES", import.meta.url)).text()
  await Promise.all([CapabilityAssetSources.hermes, CapabilityAssetSources.openclaw].map(async (source) => {
    const license = await Bun.file(new URL(`../${source.notice}`, import.meta.url)).text()
    expect(license.startsWith("MIT License\n")).toBe(true)
    expect(notices).toContain(license)
  }))
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json()
  expect(pkg.name).toBe("@orchestra/capability-assets")
  expect(pkg.private).toBe(true)
  expect(pkg.type).toBe("module")
  expect(pkg.license).toBe("MIT")
  expect(pkg.exports).toEqual({ "./catalog": "./src/catalog.ts", "./sources": "./src/sources.ts" })
  expect(pkg.dependencies ?? {}).toEqual({})
})

function coverage(entries: readonly { readonly id: string }[]) {
  expect(entries).toHaveLength(32)
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(32)
  expect(entries.map((entry) => entry.id).toSorted()).toEqual(
    Array.from({ length: 32 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`),
  )
}

function relative(file: string) {
  expect(file).not.toMatch(/[\\:*?\[\]{}\p{Cc}]/u)
  expect(file.startsWith("/")).toBe(false)
  expect(file.split("/").some((part) => ["", ".", ".."].includes(part))).toBe(false)
}

function publicData(value: unknown): void {
  if (!value || typeof value !== "object") return
  Object.entries(value).forEach(([key, child]) => {
    if (/secret|password|token|api.?key|authorization|credential/i.test(key)) throw new Error(`Private field: ${key}`)
    publicData(child)
  })
}
