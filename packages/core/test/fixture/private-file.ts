import { chmod, lstat, stat } from "node:fs/promises"
import { join, resolve } from "node:path"

// Independent read-back oracle. Do not import the production protection script.
export async function assertPrivateFile(filename: string): Promise<void> {
  if (process.platform !== "win32") {
    if (((await stat(filename)).mode & 0o777) !== 0o600) throw new Error("Private-file oracle: expected POSIX mode 0600")
    return
  }
  await powershell(filename, `
    $acl = Get-Acl -LiteralPath $env:ORCHESTRA_PRIVATE_TEST_FILE
    $current = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $current) { throw 'Private-file oracle: owner is not current SID' }
    if (-not $acl.AreAccessRulesProtected) { throw 'Private-file oracle: inheritance is not protected' }
    $approved = @($current, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne $approved.Count) { throw 'Private-file oracle: unexpected ACE count' }
    foreach ($rule in $rules) {
      if ($rule.IsInherited) { throw 'Private-file oracle: inherited ACE' }
      if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { throw 'Private-file oracle: unexpected deny ACE' }
      if ($approved -notcontains $rule.IdentityReference.Value) { throw 'Private-file oracle: broad allow ACE' }
      if ($rule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { throw 'Private-file oracle: full control missing' }
    }
    foreach ($sid in $approved) {
      if (-not ($rules | Where-Object { $_.IdentityReference.Value -eq $sid })) { throw 'Private-file oracle: required SID missing' }
    }
  `)
}

/** Deliberately unsafe permissions, confined to test roots. Calibrates the oracle. */
export async function broadenPrivateFile(filename: string, inheritance = false): Promise<void> {
  if (process.platform !== "win32") return chmod(filename, 0o644)
  await powershell(filename, `
    $acl = Get-Acl -LiteralPath $env:ORCHESTRA_PRIVATE_TEST_FILE
    $acl.SetAccessRuleProtection($env:ORCHESTRA_PRIVATE_TEST_INHERIT -ne 'true', $true)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),
      [System.Security.AccessControl.FileSystemRights]::Read,
      [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $env:ORCHESTRA_PRIVATE_TEST_FILE -AclObject $acl
  `, inheritance)
}

async function powershell(filename: string, body: string, inheritance = false) {
  if (!process.env.SystemRoot) throw new Error("Private-file oracle: Windows SystemRoot is unavailable")
  const child = Bun.spawn([
    join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(`$ErrorActionPreference = 'Stop'; try { ${body} } catch { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1 }`, "utf16le").toString("base64"),
  ], {
    env: { ...process.env, ORCHESTRA_PRIVATE_TEST_FILE: resolve(filename), ORCHESTRA_PRIVATE_TEST_INHERIT: String(inheritance) },
    stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 30_000,
  })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (child.signalCode || code !== 0) throw new Error(`Private-file oracle: native ACL read/write failed (${child.signalCode ?? code}): ${stderr.trim()}`)
}

/** Keep the file regular and owned while making the native protection operation fail. */
export async function preventNativeProtection(filename: string) {
  if (process.platform === "linux") {
    // Immutable is an inode flag, not a permission guard or a fabricated FS error.
    await immutable(filename, "+i")
    return { [Symbol.asyncDispose]: () => immutable(filename, "-i") }
  }
  if (process.platform !== "win32") throw new Error("Native protection failure fixture requires Linux chattr or Windows backend isolation")
  if (!process.env.SystemRoot) throw new Error("Native protection failure fixture: missing Windows SystemRoot")
  // Fault the real backend lookup, not protect() or the filesystem methods.
  // Callers acquire this only around a serialized publication and release before
  // teardown. The impossible root is under the same isolated source directory.
  if (!(await lstat(filename)).isFile()) throw new Error("Native protection failure fixture: file ceased to be regular")
  const root = process.env.SystemRoot
  process.env.SystemRoot = join(resolve(filename), "unavailable-windows-backend")
  return {
    async [Symbol.asyncDispose]() { process.env.SystemRoot = root },
  }
}

async function immutable(filename: string, flag: "+i" | "-i") {
  const child = Bun.spawn(["sudo", "-n", "chattr", flag, filename], {
    stdin: "ignore", stdout: "ignore", stderr: "pipe", timeout: 30_000,
  })
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  if (child.signalCode || code !== 0) throw new Error(`Native protection failure fixture: chattr ${flag} failed (${child.signalCode ?? code}): ${stderr.trim()}`)
}
