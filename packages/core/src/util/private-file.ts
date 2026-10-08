import { chmod, lstat } from "node:fs/promises"
import { join, resolve } from "node:path"

// Fixed code only: filenames travel through the environment, never PowerShell syntax.
const script = `
$ErrorActionPreference = 'Stop'
try {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($identity in @($sid.Value, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      [System.Security.Principal.SecurityIdentifier]::new($identity),
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $env:ORCHESTRA_PRIVATE_FILE -AclObject $acl
} catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  exit 1
}
`

/** Protect a completed, unpublished app-owned file. OS failures forbid publication. */
export async function protect(filename: string): Promise<void> {
  await (async () => {
    if (!(await lstat(filename)).isFile()) throw new Error("Expected a regular private file")
    if (process.platform !== "win32") return chmod(filename, 0o600)
    const root = process.env.SystemRoot
    if (!root) throw new Error("Windows SystemRoot is unavailable")
    const { execFile } = await import("node:child_process")
    await new Promise<void>((done, reject) => {
      execFile(
        join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
        { env: { ...process.env, ORCHESTRA_PRIVATE_FILE: resolve(filename) }, timeout: 30_000, windowsHide: true },
        (error) => {
          if (error) {
            reject(error)
            return
          }
          done()
        },
      )
    })
  })().catch((cause: unknown) => {
    throw new Error(`PrivateFile.protect failed (${process.platform}): ${filename}`, { cause })
  })
}

export * as PrivateFile from "./private-file"
