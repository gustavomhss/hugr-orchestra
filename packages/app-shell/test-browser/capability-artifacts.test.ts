import { expect, mock, test } from "bun:test"
import path from "node:path"

async function child(args: string[], env = process.env) {
  const proc = Bun.spawn([Bun.which("bun")!, ...args], {
    cwd: path.resolve(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe", timeout: 180000, killSignal: "SIGKILL",
  })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}\n${out}\n${err}`)
  console.log(out + err)
}

// The context fixtures below replace shared modules for the rest of a `bun test` process, so they run in a child
// process of their own, like the Lean DOM lanes.
if (process.env.CAPABILITY_ARTIFACTS_DOM !== "1") {
  test("a transcript chip opens the Artifacts panel and previews the image", async () => {
    await child(["--conditions=browser", "test", "--preload", "./happydom.ts", import.meta.path], {
      ...process.env, CAPABILITY_ARTIFACTS_DOM: "1",
    })
  }, 240000)
} else {
  const { createComponent, createStore, render } = await import("./lean-dom.test-helper")
  const { solidDom } = await import("./solid-dom")
  const { createSignal } = await import("solid-js")
  const { Capability } = await import("@orchestra/schema/capability")

  const ref = { id: Capability.ArtifactID.make(`cart_${"1".padStart(26, "0")}`), revision: 0 }
  const artifact = { artifact: ref, mime: "image/png", kind: "file", hash: "a".repeat(64), bytes: 68,
    verification: "observed", timeCreated: 1, pinned: false }
  const clip = { ...artifact, artifact: { id: Capability.ArtifactID.make(`cart_${"2".padStart(26, "0")}`), revision: 0 },
    mime: "video/mp4", bytes: 4096, timeCreated: 2 }
  // A 1x1 PNG, so the preview decodes a real image body.
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
    (char) => char.charCodeAt(0))
  const requests: string[] = []
  const tickets = { minted: 0 }
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    const url = new URL(request.url)
    requests.push(url.pathname)
    if (url.pathname.endsWith("/content")) return new Response(png, { headers: { "content-type": "image/png" } })
    if (url.pathname.endsWith("/content-ticket")) {
      tickets.minted++
      return Response.json({ url: `/api/capability/content/ticket-${tickets.minted}`, expiresAt: Date.now() + 300000 })
    }
    if (url.pathname.endsWith("/artifacts")) return Response.json({ items: [artifact, clip], coverage: "live" })
    return Response.json(artifact)
  } })

  const sessionID = `ses_${"1".padStart(26, "0")}`
  const part = { id: "prt_1", sessionID, messageID: "msg_1", type: "tool", callID: "call_1", tool: "artifact_save",
    state: { status: "completed", input: {}, output: JSON.stringify({ artifactRefs: [ref] }), metadata: {}, title: "",
      time: { start: 0, end: 1 } } }
  const [data] = createStore({ message: { [sessionID]: [{ id: "msg_1" }] }, part: { msg_1: [part] }, session: [] })
  const [opened, setOpened] = createSignal(false)
  const [active, setActive] = createSignal<string | undefined>()
  const tabs = { open: (tab: string) => setActive(tab), setActive, active }
  const view = { reviewPanel: { opened, open: () => setOpened(true), close: () => setOpened(false) } }

  // External context fixtures only; the real capabilities provider, artifacts model, HTTP client and panel run against
  // the fixture server. Fixtures replace the solidDom() copies (./solid-dom) those modules import.
  mock.module(solidDom("@/context/sdk", import.meta.dir), () => ({ useSDK: () => () => ({ directory: "/work/project" }) }))
  mock.module(solidDom("@/context/server-sdk", import.meta.dir), () => ({
    useServerSDK: () => () => ({ server: { http: { url: server.url.href } } }),
  }))
  mock.module(solidDom("@/context/sync", import.meta.dir), () => ({
    useSync: () => () => ({ data, session: { get: () => undefined } }),
  }))
  mock.module(solidDom("@/pages/session/session-layout", import.meta.dir), () => ({
    useSessionLayout: () => ({ params: { id: sessionID }, sessionKey: () => sessionID, tabs: () => tabs, view: () => view }),
  }))
  const { SessionCapabilitiesProvider }: typeof import("@/pages/session/capabilities") = await import(
    solidDom("@/pages/session/capabilities", import.meta.dir)
  )
  const { ArtifactsPanel }: typeof import("@/pages/session/artifacts-panel") = await import(
    solidDom("@/pages/session/artifacts-panel", import.meta.dir)
  )
  const { useToolPartSlot }: typeof import("@orchestra/session-ui/context") = await import(
    solidDom("@orchestra/session-ui/context", import.meta.dir)
  )
  const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
  const { LanguageProvider }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))
  const { DialogProvider }: typeof import("@orchestra/ui/context/dialog") = await import(
    solidDom("@orchestra/ui/context/dialog", import.meta.dir)
  )
  const { Show }: typeof import("solid-js") = await import("solid-js")

  const until = async (check: () => boolean, host: HTMLElement) => {
    const deadline = Date.now() + 8000
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timed out: ${requests.join(", ")}\n${host.innerHTML}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  test("a transcript chip opens the Artifacts panel at that artifact and previews the image", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const dispose = render(() => createComponent(PlatformProvider, {
      value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
      get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
        return createComponent(DialogProvider, { get children() {
          return createComponent(SessionCapabilitiesProvider, { revealPart: () => false, get children() {
            // The transcript renders the host's slot under each tool part; the side panel shows the tab once selected.
            const Chips = useToolPartSlot()
            return [
              Chips ? createComponent(Chips, { part: part as never }) : undefined,
              createComponent(Show, {
                get when() { return opened() && active() === "artifacts" },
                get children() { return createComponent(ArtifactsPanel, {}) },
              }),
            ]
          } })
        } })
      } }) },
    }), host)

    // The chip names the artifact's kind once the Session's list has loaded.
    await until(() => host.querySelector('[data-slot="artifact-chip-kind"]')?.textContent === "Image", host)
    expect(host.querySelector('[data-component="artifacts-panel"]')).toBeNull()

    host.querySelector<HTMLButtonElement>('[data-slot="artifact-chip"]')?.click()
    await until(() => !!host.querySelector('[data-slot="artifact-preview"] img'), host)
    expect(opened()).toBe(true)
    expect(active()).toBe("artifacts")
    const rows = () => [...host.querySelectorAll<HTMLButtonElement>('[data-slot="artifacts-row"]')]
    expect(rows().map((row) => row.getAttribute("aria-pressed")).filter((pressed) => pressed === "true")).toHaveLength(1)
    expect(host.querySelector('[data-slot="artifact-preview"]')?.getAttribute("data-preview")).toBe("image")
    expect(host.querySelector('[data-slot="artifact-preview"] img')?.getAttribute("src")).toStartWith("blob:")
    // An unverified artifact says so next to its preview.
    expect(host.querySelector('[data-slot="artifact-unverified"]')).not.toBeNull()
    expect(requests.some((item) => item.endsWith(`/artifacts/${ref.id}/0/content`))).toBe(true)

    // A video streams from a header-free ticket URL instead of a downloaded blob.
    rows().find((row) => row.getAttribute("aria-pressed") !== "true")?.click()
    await until(() => !!host.querySelector('[data-slot="artifact-preview"] video'), host)
    const video = () => host.querySelector<HTMLVideoElement>('[data-slot="artifact-preview"] video')!
    expect(video().getAttribute("src")).toBe(new URL("/api/capability/content/ticket-1", server.url).href)
    expect(requests.some((item) => item.endsWith(`/artifacts/${clip.artifact.id}/0/content`))).toBe(false)

    // An expired ticket fails the element once; the panel mints a fresh one.
    video().dispatchEvent(new Event("error"))
    await until(() => video()?.getAttribute("src")?.endsWith("/ticket-2") ?? false, host)
    // A second failure before playback resumes is a real error, not another mint.
    video().dispatchEvent(new Event("error"))
    await until(() => host.querySelector('[data-slot="artifact-preview"]')?.getAttribute("data-status") === "error", host)
    expect(tickets.minted).toBe(2)

    dispose()
    host.remove()
    server.stop(true)
  }, 20000)
}
