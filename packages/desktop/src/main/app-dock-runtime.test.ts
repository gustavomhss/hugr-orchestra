import { plugin } from "bun"
import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const enabled = process.env.APP_DOCK_RUNTIME_INTEGRATION === "1"
const temporary = process.env.APP_DOCK_RUNTIME_TEST_TMP ?? join(tmpdir(), "opencode")
const context = process.env.APP_DOCK_RUNTIME_TEST_X11_MUTATION === "1"
  ? await fixtureRoot("x11-mutation")
  : resolve("resources/linux-runtime")
const label = "io.orchestra.app-dock"
let image = process.env.APP_DOCK_RUNTIME_TEST_IMAGE

if (process.env.APP_DOCK_RUNTIME_TEST_X11_MUTATION === "1") {
  if (!enabled || !image) throw new Error("X11 mutation requires real Docker integration and an existing image")
  const text = await Bun.file(resolve("resources/linux-runtime/workspace.py")).text()
  const before = "        clear_stale_display()\n"
  expect(text.split(before)).toHaveLength(2)
  await writeFile(join(context, "workspace.py"), text.replace(before, ""))
  await writeFile(join(context, "seccomp.json"), await Bun.file(resolve("resources/linux-runtime/seccomp.json")).bytes())
}

if (process.env.APP_DOCK_RUNTIME_TEST_LIMIT_MUTATION === "1") {
  if (!enabled) throw new Error("Resource-limit mutation requires real Docker integration")
  plugin({
    name: "runtime-pid-limit-mutation",
    setup(build) {
      build.onLoad({ filter: /app-dock-runtime\.ts$/ }, async (args) => {
        const text = await Bun.file(args.path).text()
        const before = "found.HostConfig.PidsLimit !== 512 ||"
        expect(text.split(before)).toHaveLength(2)
        return { contents: text.replace(before, ""), loader: "ts" }
      })
    },
  })
}
const { AppDockRuntime } = await import("./app-dock-runtime")

async function docker(args: string[], extraEnv = {}) {
  return exec("docker", args, { env: { ...process.env, ...extraEnv }, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })
}

async function fixtureRoot(kind: string) {
  await mkdir(temporary, { recursive: true })
  return mkdtemp(join(temporary, `orchestra-dock-linux-${kind}-`))
}

async function removeFixture(id: string, home: string, owner: string) {
  const container = JSON.parse((await docker(["container", "inspect", "--format", "{{json .}}", id])).stdout) as {
    Id: string
    Config: { Labels: Record<string, string> }
  }
  expect(container.Id).toBe(id)
  expect(container.Config.Labels[`${label}.owner`]).toBe(owner)
  await docker(["rm", "--force", id])
  await expect(docker(["container", "inspect", id])).rejects.toMatchObject({
    stderr: `Error response from daemon: No such container: ${id}\n`,
  })
  const volume = JSON.parse((await docker(["volume", "inspect", "--format", "{{json .}}", home])).stdout) as {
    Name: string
    Labels: Record<string, string>
  }
  expect(volume.Name).toBe(home)
  expect(volume.Labels[`${label}.owner`]).toBe(owner)
  await docker(["volume", "rm", home])
  await expect(docker(["volume", "inspect", home])).rejects.toMatchObject({
    stderr: `Error response from daemon: get ${home}: no such volume\n`,
  })
}

test.skipIf(!enabled)(
  "persistent workspace installs and launches through actual Gio/Xpra",
  async () => {
    const root = await fixtureRoot("runtime")
    const runtime = AppDockRuntime.create({ root, context, image })
    const cleanup = { id: "", owner: "", home: "" }
    try {
      expect((await runtime.state()).phase).toBe("stopped")
      const concurrent = AppDockRuntime.create({ root, context, image })
      const started = await Promise.all([runtime.start(), concurrent.start()])
      expect(started[0]).toEqual(started[1])
      const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as {
        owner: string
        containerID: string
        dockerContext: string
        endpoint: string
      }
      cleanup.id = metadata.containerID
      cleanup.owner = metadata.owner
      cleanup.home = `orchestra-linux-${metadata.owner}-home`
      image = (await docker(["container", "inspect", "--format", "{{.Image}}", cleanup.id])).stdout.trim()
      const initial = await runtime.state()
      expect(initial.phase).toBe("ready")
      expect(initial.apps.some((app) => app.id === "debian-xterm.desktop" || app.id === "xterm.desktop")).toBe(true)
      expect(JSON.stringify(initial).includes(started[0].password)).toBe(false)
      expect(JSON.stringify(initial).includes(root)).toBe(false)
      expect(JSON.stringify(initial).includes(started[0].url)).toBe(false)
      const displayLock = (await docker(["exec", cleanup.id, "python3", "-c", "from pathlib import Path; print(Path('/tmp/.X100-lock').read_text())"])).stdout
      expect(displayLock.trim()).toMatch(/^\d+$/)
      const activeDisplay = await docker(["exec", cleanup.id, "python3", "-c", "import runpy; runpy.run_path('/opt/orchestra/workspace.py')['clear_stale_display']()"]).catch(error => error)
      expect(activeDisplay.stderr).toContain("display-active")
      expect((await docker(["exec", cleanup.id, "python3", "-c", "from pathlib import Path; print(Path('/tmp/.X100-lock').read_text())"])).stdout).toBe(displayLock)
      const baseline = await docker([
        "exec",
        cleanup.id,
        "dpkg-query",
        "-W",
        "-f=${Package}=${Version}\n",
        "xpra-server",
        "xpra-x11",
        "xpra-html5",
      ])
      expect(baseline.stdout).toContain("xpra-server=6.5.4-r0-1")
      expect(baseline.stdout).toContain("xpra-x11=6.5.4-r0-1")
      expect(baseline.stdout).toContain("xpra-html5=21-r1-1")
      await docker([
        "exec",
        "--user",
        "root",
        cleanup.id,
        "python3",
        "-c",
        `
from pathlib import Path
import io, subprocess, tarfile
lock = Path('/tmp/.X100-lock').stat()
entry = tarfile.TarInfo('.X100-lock')
entry.uid, entry.gid, entry.mode, entry.size = lock.st_uid, lock.st_gid, 0o600, 11
with tarfile.open('/tmp/orchestra-stale-display.tar', 'w') as archive:
    archive.addfile(entry, io.BytesIO(b'         1\\n'))
base = Path('/tmp/orchestra-test-deb')
(base / 'DEBIAN').mkdir(parents=True)
(base / 'usr/share/applications').mkdir(parents=True)
(base / 'usr/share/orchestra-runtime-test').mkdir(parents=True)
(base / 'DEBIAN/control').write_text('Package: orchestra-runtime-test\\nVersion: 1.0\\nArchitecture: all\\nMaintainer: Orchestra Test <test@example.invalid>\\nDepends: bc\\nDescription: Gio integration fixture\\n')
(base / 'usr/share/applications/orchestra-runtime-test.desktop').write_text('[Desktop Entry]\\nType=Application\\nName=Orchestra runtime test\\nExec=/usr/bin/python3 "/usr/share/orchestra-runtime-test/launch probe.py" %% %U\\nTerminal=false\\n')
(base / 'usr/share/orchestra-runtime-test/launch probe.py').write_text('from gi.repository import Gtk, Gio\\nimport json, os, sys\\nfrom pathlib import Path\\nGtk.init([])\\nGio.bus_get_sync(Gio.BusType.SESSION, None)\\nwindow=Gtk.Window(title="Orchestra runtime integration")\\nwindow.show_all()\\nPath("/home/dock/launch-result.json").write_text(json.dumps({"display":os.environ["DISPLAY"],"dbus":bool(os.environ.get("DBUS_SESSION_BUS_ADDRESS")),"args":sys.argv[1:]}))\\nGtk.main()\\n')
subprocess.run(['dpkg-deb','--build','--root-owner-group',str(base),'/tmp/orchestra-native.deb'], check=True)
native = subprocess.check_output(['dpkg','--print-architecture'],text=True).strip()
(base / 'DEBIAN/control').write_text('Package: orchestra-wrong-architecture\\nVersion: 1.0\\nArchitecture: '+('arm64' if native != 'arm64' else 'amd64')+'\\nMaintainer: Orchestra Test <test@example.invalid>\\nDescription: Architecture rejection fixture\\n')
subprocess.run(['dpkg-deb','--build','--root-owner-group',str(base),'/tmp/orchestra-wrong.deb'], check=True)
`,
      ])
      await docker(["cp", `${cleanup.id}:/tmp/orchestra-native.deb`, join(root, "native package.deb")])
      await docker(["cp", `${cleanup.id}:/tmp/orchestra-wrong.deb`, join(root, "wrong.deb")])
      await docker(["cp", `${cleanup.id}:/tmp/orchestra-stale-display.tar`, join(root, "stale-display.tar")])
      await writeFile(join(root, "invalid.deb"), "not a Debian package")
      await expect(runtime.install(join(root, "wrong.deb"))).rejects.toMatchObject({ code: "architecture-mismatch" })
      await expect(runtime.install(join(root, "invalid.deb"))).rejects.toMatchObject({ code: "invalid-package" })
      const installed = await runtime.install(join(root, "native package.deb"))
      expect(installed.some((app) => app.id === "orchestra-runtime-test.desktop")).toBe(true)
      expect((await docker(["exec", cleanup.id, "dpkg-query", "-W", "-f=${Status}", "bc"])).stdout).toBe(
        "install ok installed",
      )
      await expect(runtime.launch("orchestra-runtime-test.desktop; touch /tmp/not-a-command")).rejects.toMatchObject({
        code: "failed",
      })
      await runtime.launch("orchestra-runtime-test.desktop")
      const deadline = Date.now() + 10_000
      const launched = async (): Promise<{ display: string; dbus: boolean; args: string[] }> => {
        const result = await docker([
          "exec",
          cleanup.id,
          "python3",
          "-c",
          "from pathlib import Path; print(Path('/home/dock/launch-result.json').read_text())",
        ]).catch(() => undefined)
        if (result) return JSON.parse(result.stdout)
        if (Date.now() >= deadline) throw new Error("Gio fixture did not launch")
        await new Promise((resolve) => setTimeout(resolve, 100))
        return launched()
      }
      expect(await launched()).toEqual({ display: ":100", dbus: true, args: ["%"] })
      await docker(["update", "--pids-limit", "1024", cleanup.id])
      await expect(runtime.stop()).rejects.toMatchObject({ code: "failed" })
      expect((await docker(["inspect", "--format", "{{.State.Running}}", cleanup.id])).stdout.trim()).toBe("true")
      await docker(["update", "--pids-limit", "512", cleanup.id])
      await runtime.stop()
      expect((await runtime.state()).phase).toBe("stopped")
      const reloaded = AppDockRuntime.create({ root, context, image })
      expect((await reloaded.state()).phase).toBe("stopped")
      // PID 1 is alive again on the next start; an old lock can therefore look
      // active to Xvfb even though it belongs to an unrelated process incarnation.
      // Plain docker cp adopts the host UID. Preserve the actual Xvfb owner's UID
      // so sticky /tmp exercises stale-display recovery rather than permissions.
      const injection = Bun.spawn(["docker", "--host", metadata.endpoint, "cp", "--archive", "-", `${cleanup.id}:/tmp`], {
        stdin: Bun.file(join(root, "stale-display.tar")),
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(await injection.exited).toBe(0)
      expect(await new Response(injection.stderr).text()).toBe("")
      expect((await docker(["cp", `${cleanup.id}:/tmp/.X100-lock`, join(root, "copied-display-lock")])).stdout).toBe("")
      expect(await readFile(join(root, "copied-display-lock"), "utf8")).toContain("1")
      const restarted = await reloaded.start()
      expect(restarted.password === started[0].password).toBe(true)
      expect((await reloaded.state()).apps.some((app) => app.id === "orchestra-runtime-test.desktop")).toBe(true)
      expect(
        (
          await docker([
            "exec",
            cleanup.id,
            "python3",
            "-c",
            "from pathlib import Path; print(Path('/home/dock/launch-result.json').exists())",
          ])
        ).stdout.trim(),
      ).toBe("True")
      await reloaded.launch("orchestra-runtime-test.desktop")
      await reloaded.stop()
    } catch (error) {
      const saved = await readFile(join(root, "metadata.json"), "utf8")
        .then((text) => JSON.parse(text) as { containerID?: string; password: string })
        .catch(() => undefined)
      if (saved?.containerID) {
        const logs = await docker(["logs", saved.containerID]).catch(() => undefined)
        if (logs)
          console.error(
            (logs.stdout + logs.stderr)
              .replaceAll(saved.password, "[REDACTED]")
              .split("\n")
              .filter((line) => /Traceback|Error|failed|DBus|child|ready|cannot/.test(line))
              .join("\n"),
          )
        await docker([
          "cp",
          `${saved.containerID}:/home/dock/.orchestra-runtime/session.json`,
          join(root, "session.json"),
        ])
          .then(async () => {
            const session = JSON.parse(await readFile(join(root, "session.json"), "utf8")) as Record<string, string>
            console.error({
              sessionKeys: Object.keys(session),
              display: session.DISPLAY,
              hasDBus: !!session.DBUS_SESSION_BUS_ADDRESS,
            })
          })
          .catch(() => undefined)
        image = (await docker(["container", "inspect", "--format", "{{.Image}}", saved.containerID])).stdout.trim()
      }
      throw error
    } finally {
      if (!cleanup.id) {
        const metadata = await readFile(join(root, "metadata.json"), "utf8")
          .then((text) => JSON.parse(text) as { owner: string; containerID?: string })
          .catch(() => undefined)
        if (metadata?.containerID) {
          cleanup.id = metadata.containerID
          cleanup.owner = metadata.owner
          cleanup.home = `orchestra-linux-${metadata.owner}-home`
        }
      }
      if (cleanup.id) await removeFixture(cleanup.id, cleanup.home, cleanup.owner)
    }
  },
  600_000,
)

test.skipIf(!enabled)(
  "refuses foreign owner and changed recorded ID before stopping a disposable fixture",
  async () => {
    if (!image) throw new Error("Set APP_DOCK_RUNTIME_TEST_IMAGE to the integration image for this test alone")
    const root = await fixtureRoot("ownership")
    const owner = randomUUID()
    const foreign = randomUUID()
    const name = `orchestra-linux-${owner}`
    const home = `${name}-home`
    const password = randomBytes(32).toString("hex")
    const dockerContext = (await docker(["context", "show"])).stdout.trim()
    const endpoint = JSON.parse((await docker(["context", "inspect", dockerContext])).stdout)[0].Endpoints.docker
      .Host as string
    await docker([
      "volume",
      "create",
      "--label",
      `${label}=workspace`,
      "--label",
      `${label}.owner=${foreign}`,
      "--label",
      `${label}.kind=home`,
      home,
    ])
    const id = (
      await docker(
        [
          "create",
          "--init",
          "--name",
          name,
          "--label",
          `${label}=workspace`,
          "--label",
          `${label}.owner=${foreign}`,
          "--label",
          `${label}.kind=workspace`,
          "--cpus",
          "2",
          "--memory",
          "2g",
          "--pids-limit",
          "512",
          "--shm-size",
          "128m",
          "--env",
          "APP_DOCK_RUNTIME_PASSWORD",
          "--security-opt",
          `seccomp=${join(context, "seccomp.json")}`,
          "--mount",
          `type=volume,source=${home},target=/home/dock`,
          "--entrypoint",
          "sleep",
          image,
          "infinity",
        ],
        { APP_DOCK_RUNTIME_PASSWORD: password },
      )
    ).stdout.trim()
    const cleanup = { id, owner: foreign }
    try {
      await docker(["start", id])
      expect((await docker(["inspect", "--format", "{{.State.Running}}", id])).stdout.trim()).toBe("true")
      await writeFile(
        join(root, "metadata.json"),
        JSON.stringify({ version: 1, owner, password, dockerContext, endpoint, containerID: id }),
        { mode: 0o600 },
      )
      const runtime = AppDockRuntime.create({ root, context, image })
      await expect(runtime.stop()).rejects.toMatchObject({ code: "failed" })
      await expect(runtime.start()).rejects.toMatchObject({ code: "failed" })
      expect((await docker(["inspect", "--format", "{{.State.Running}}", id])).stdout.trim()).toBe("true")
      await removeFixture(cleanup.id, home, cleanup.owner)
      cleanup.id = ""
      await writeFile(
        join(root, "metadata.json"),
        JSON.stringify({ version: 1, owner, password, dockerContext, endpoint }),
        { mode: 0o600 },
      )
      // Use a fully valid owned workspace so no later label/mount guard can mask the ID check.
      await AppDockRuntime.create({ root, context, image }).start()
      const recorded = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as { containerID: string }
      cleanup.id = recorded.containerID
      cleanup.owner = owner
      await writeFile(
        join(root, "metadata.json"),
        JSON.stringify({ version: 1, owner, password, dockerContext, endpoint, containerID: "0".repeat(64) }),
        { mode: 0o600 },
      )
      await expect(AppDockRuntime.create({ root, context, image }).stop()).rejects.toMatchObject({ code: "failed" })
      expect((await docker(["inspect", "--format", "{{.State.Running}}", cleanup.id])).stdout.trim()).toBe("true")
    } finally {
      if (!cleanup.id) {
        const recorded = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as { containerID?: string }
        if (recorded.containerID) {
          cleanup.id = recorded.containerID
          cleanup.owner = owner
        }
      }
      if (cleanup.id) await removeFixture(cleanup.id, home, cleanup.owner)
    }
  },
  90_000,
)
