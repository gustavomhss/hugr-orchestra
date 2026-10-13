// Per-user Shell state is shared by processes; use only on disposable GitHub-hosted Windows runners.
import assert from "node:assert/strict"
import { realpathSync, statSync } from "node:fs"
import { win32 } from "node:path"

const KF_FLAG_DONT_UNEXPAND = 0x2000

export async function isolateWindowsShell(input: { appdata: string; documents: string }) {
  if (process.platform !== "win32") return undefined
  assert.equal(process.env.GITHUB_ACTIONS, "true", "HOSTED_PROOF_REQUIRED")
  assert.ok(process.env.CI && process.env.GITHUB_RUN_ID, "HOSTED_RUN_REQUIRED")
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted", "DISPOSABLE_HOSTED_RUNNER_REQUIRED")
  const folders = [
    // GUID Data1/Data2/Data3 are little-endian; Data4 retains byte order.
    { name: "FOLDERID_RoamingAppData", csidl: 0x1a, guid: "db85b63ef965f64ca03ae3ef65729f3d", target: input.appdata },
    { name: "FOLDERID_Documents", csidl: 0x05, guid: "d09ad3fd8f23af46adb46c85480369c7", target: input.documents },
  ].map((folder) => {
    assert.ok(win32.isAbsolute(folder.target) && win32.parse(folder.target).root.length > 1 &&
      !folder.target.includes("\0"), `WINDOWS_SHELL_TARGET_INVALID(${folder.name})`)
    const target = realpathSync.native(folder.target)
    const identity = statSync(target, { bigint: true })
    assert.ok(identity.isDirectory() && identity.ino !== 0n && target.length < 260,
      `WINDOWS_SHELL_TARGET_INVALID(${folder.name})`)
    const guid = new Uint32Array(4)
    new Uint8Array(guid.buffer).set(Buffer.from(folder.guid, "hex"))
    return { ...folder, guid, target, identity }
  })
  const { dlopen } = await import("bun:ffi")
  // HANDLE/HWND use u64, not Bun's pointer coercion. Windows x64/ARM64 share the C ABI.
  const shell = dlopen("shell32.dll", {
    SHGetFolderPathW: { args: ["u64", "i32", "u64", "u32", "ptr"], returns: "i32" },
    SHSetKnownFolderPath: { args: ["ptr", "u32", "u64", "ptr"], returns: "i32" },
  })
  const read = (folder: (typeof folders)[number]) => {
    const buffer = new Uint16Array(260)
    checkHRESULT("SHGetFolderPathW", folder.name, shell.symbols.SHGetFolderPathW(0n, folder.csidl, 0n, 0, buffer))
    const end = buffer.indexOf(0)
    assert.ok(end > 0, `WINDOWS_SHELL_PATH_INVALID(${folder.name})`)
    const directory = Buffer.from(buffer.buffer, 0, end * 2).toString("utf16le")
    assert.ok(win32.isAbsolute(directory) && win32.parse(directory).root.length > 1,
      `WINDOWS_SHELL_PATH_INVALID(${folder.name})`)
    return directory
  }
  const set = (folder: (typeof folders)[number], directory: string) => {
    const buffer = new Uint16Array(directory.length + 1)
    Buffer.from(`${directory}\0`, "utf16le").copy(Buffer.from(buffer.buffer))
    // Keep literal paths when packaged.ts replaces USERPROFILE/APPDATA/LOCALAPPDATA.
    checkHRESULT("SHSetKnownFolderPath", folder.name,
      shell.symbols.SHSetKnownFolderPath(folder.guid, KF_FLAG_DONT_UNEXPAND, 0n, buffer))
  }
  const verify = (folder: (typeof folders)[number], expected: (typeof folders)[number]["identity"]) => {
    const observed = statSync(realpathSync.native(read(folder)), { bigint: true })
    assert.ok(observed.isDirectory() && observed.ino !== 0n && observed.dev === expected.dev && observed.ino === expected.ino,
      `WINDOWS_SHELL_PATH_MISMATCH(${folder.name})`)
  }
  const state = { restored: false }
  try {
    // LocalAppData relocation is blocked; Desktop uses RoamingAppData and onboarding needs Documents.
    // Capture legacy paths and physical identities before the first write.
    const originals = folders.map((folder) => {
      const original = read(folder)
      const originalIdentity = statSync(realpathSync.native(original), { bigint: true })
      assert.ok(originalIdentity.isDirectory() && originalIdentity.ino !== 0n,
        `WINDOWS_SHELL_ORIGINAL_INVALID(${folder.name})`)
      return { ...folder, original, originalIdentity }
    })
    const attempted: typeof originals = []
    const restore = () => {
      if (state.restored) return
      const errors = attempted.toReversed().flatMap((folder) => {
        try {
          set(folder, folder.original)
          verify(folder, folder.originalIdentity)
          return []
        } catch (error) { return [error] }
      })
      if (errors.length) throw new AggregateError(errors, "WINDOWS_SHELL_RESTORE_FAILED")
      shell.close()
      state.restored = true
    }
    try {
      originals.forEach((folder) => {
        // A failed setter may have partially changed state; include it in rollback.
        attempted.push(folder)
        set(folder, folder.target)
        verify(folder, folder.identity)
      })
    } catch (error) {
      try { restore() } catch (rollback) {
        throw new AggregateError([error, rollback], "WINDOWS_SHELL_ACQUIRE_AND_ROLLBACK_FAILED", { cause: error })
      }
      throw error
    }
    return { restore }
  } catch (error) {
    if (!state.restored) {
      try { shell.close() } catch (close) {
        throw new AggregateError([error, close], "WINDOWS_SHELL_ACQUIRE_AND_CLOSE_FAILED", { cause: error })
      }
    }
    throw error
  }
}

function checkHRESULT(api: string, folder: string, hresult: number) {
  // These APIs require S_OK; SHGetFolderPathW's S_FALSE leaves an unusable empty path.
  if (hresult === 0) return
  throw Object.assign(new Error(`${api}(${folder}): HRESULT 0x${(hresult >>> 0).toString(16).padStart(8, "0")}`),
    { name: `${api}Error`, api, folder, hresult })
}
