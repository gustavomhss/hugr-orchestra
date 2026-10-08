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
    if (!process.env.SystemRoot) throw new Error("Windows SystemRoot is unavailable")
    const child = Bun.spawn([
      join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64"),
    ], {
      env: { ...process.env, ORCHESTRA_PRIVATE_FILE: resolve(filename) },
      stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 30_000,
    })
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    if (child.signalCode) throw new Error(`Windows DACL protection terminated: ${child.signalCode}`)
    if (code !== 0) throw new Error(`Windows DACL protection failed (${code}): ${stderr.trim()}`)
  })().catch((cause: unknown) => {
    throw new Error(`PrivateFile.protect failed (${process.platform}): ${filename}`, { cause })
  })
}

export * as PrivateFile from "./private-file"
