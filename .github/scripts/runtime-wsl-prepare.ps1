# Source-only infrastructure, not A04 product/auth evidence or publisher certification.
# Operator supplies an approved, downloaded rootfs and exact SHA256. No downloads,
# feature enablement, restarts, explicit default selection, or machine-wide shutdown.
# PUB-NS-001: controlled CI, build-owned cooperating publisher/account namespace.
# Stable regular/reparse/confinement checks apply; hostile same-UID mutation is excluded.
# Registrations are per Windows account. Cleanup uses that same account/temp setting.
# Explicit RUNNER_TEMP is required; reports stay beneath this declared CI namespace.
# Hard kill can bypass finally or leave WSL service import work: an external janitor
# MUST discover OrchestraCI-*/recovery.json, retain a copy before cleanup, and retry
# this entrypoint while its owned root remains. No hard-kill cleanup guarantee.
# https://learn.microsoft.com/en-us/windows/wsl/basic-commands
[CmdletBinding(DefaultParameterSetName = 'Prepare')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$Rootfs,
    [Parameter(Mandatory, ParameterSetName = 'Prepare')][string]$Sha256,
    [Parameter(Mandatory, ParameterSetName = 'Prepare')][ValidateSet(1, 2)][int]$Version,
    [Parameter(Mandatory)][string]$Report,
    [Parameter(Mandatory, ParameterSetName = 'Cleanup')][switch]$Cleanup
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ActiveLauncher = $null
function Require($Condition, [string]$Failure) { if (-not $Condition) { throw $Failure } }
function AbsolutePath([string]$Path) {
    Require ($Path -cmatch '^[A-Za-z]:\\' -and $Path -notmatch '[\x00-\x1f]' -and $Path -notmatch '(^|[\\/])\.\.?([\\/]|$)' -and $Path.Substring(2) -notmatch ':') 'INFRA_PATH_NOT_ABSOLUTE_LOCAL'
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}
function NoReparse([string]$Path) {
    Require (Test-Path -LiteralPath $Path) 'INFRA_PATH_MISSING'
    $Item = Get-Item -LiteralPath $Path -Force
    while ($null -ne $Item) {
        Require (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'INFRA_REPARSE_PATH_REFUSED'
        $Item = if ($Item -is [IO.DirectoryInfo]) { $Item.Parent } else { $Item.Directory }
    }
}
function RegularFile([string]$Path) {
    NoReparse $Path
    Require ((Get-Item -LiteralPath $Path -Force) -is [IO.FileInfo]) 'INFRA_REGULAR_FILE_REQUIRED'
}
function Digest([byte[]]$Bytes) {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($Hasher.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $Hasher.Dispose() }
}
function StopLauncher {
    if ($null -eq $script:ActiveLauncher) { return }
    # Only the Process object started here, never process trees, names, or caller PIDs.
    try { $Exited = $script:ActiveLauncher.HasExited }
    catch [InvalidOperationException] {
        # Start failed before this Process object acquired a child.
        $script:ActiveLauncher.Dispose(); $script:ActiveLauncher = $null
        return
    }
    if (-not $Exited) { $script:ActiveLauncher.Kill() }
    Require ($script:ActiveLauncher.WaitForExit(5000)) 'INFRA_OWN_LAUNCHER_STOP_UNCONFIRMED'
    $script:ActiveLauncher.Dispose()
    $script:ActiveLauncher = $null
}
function Wsl([string[]]$Arguments, [string]$Failure, [int]$Seconds = 20) {
    Require ($null -eq $script:ActiveLauncher) 'INFRA_OWN_LAUNCHER_STILL_ACTIVE'
    $Start = [Diagnostics.ProcessStartInfo]::new($script:WslExe)
    $Start.UseShellExecute = $false
    $Start.RedirectStandardOutput = $true
    $Start.RedirectStandardError = $true
    $Start.CreateNoWindow = $true
    foreach ($Argument in $Arguments) { $Start.ArgumentList.Add($Argument) }
    $Process = [Diagnostics.Process]::new()
    $Process.StartInfo = $Start
    $Captured = @([IO.MemoryStream]::new(), [IO.MemoryStream]::new())
    $Total = 0
    $Clock = [Diagnostics.Stopwatch]::StartNew()
    try {
        $script:ActiveLauncher = $Process
        Require ($Process.Start()) "${Failure}_LAUNCH_FAILED"
        $Streams = @($Process.StandardOutput.BaseStream, $Process.StandardError.BaseStream)
        $Buffers = @([byte[]]::new(4096), [byte[]]::new(4096))
        $Tasks = @($Streams[0].ReadAsync($Buffers[0], 0, 4096), $Streams[1].ReadAsync($Buffers[1], 0, 4096))
        $Ended = @($false, $false)
        while (-not ($Process.HasExited -and $Ended[0] -and $Ended[1])) {
            Require ($Clock.Elapsed.TotalSeconds -lt $Seconds) "${Failure}_TIMEOUT"
            for ($Index = 0; $Index -lt 2; $Index++) {
                if ($Ended[$Index] -or -not $Tasks[$Index].IsCompleted) { continue }
                $Count = $Tasks[$Index].GetAwaiter().GetResult()
                $Total += $Count
                Require ($Total -le 65536) "${Failure}_OUTPUT_OVERFLOW"
                if ($Count -eq 0) { $Ended[$Index] = $true; continue }
                $Captured[$Index].Write($Buffers[$Index], 0, $Count)
                $Tasks[$Index] = $Streams[$Index].ReadAsync($Buffers[$Index], 0, 4096)
            }
            [Threading.Thread]::Sleep(10)
        }
        # WSL list/status can redirect UTF16LE; guest commands emit UTF8.
        $OutputBytes = $Captured[0].ToArray()
        $Utf16 = $OutputBytes.Length -ge 2 -and (($OutputBytes[0] -eq 255 -and $OutputBytes[1] -eq 254) -or $OutputBytes[1] -eq 0)
        $Encoding = if ($Utf16) { [Text.Encoding]::Unicode } else { [Text.Encoding]::UTF8 }
        $Output = $Encoding.GetString($OutputBytes).Trim([char]0xfeff).Trim()
        if ($Process.ExitCode -ne 0) {
            if ($Output -cmatch '^INFRA_GUEST_COMMAND_REQUIRED:[a-z0-9]+$') { throw $Output }
            throw $Failure
        }
        return $Output
    } finally {
        try { StopLauncher } finally {
            foreach ($Capture in $Captured) { $Capture.Dispose() }
            if ($null -eq $script:ActiveLauncher) { $Process.Dispose() }
        }
    }
}
function Registrations([string]$Name = '') {
    $Key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
    if (-not (Test-Path $Key)) { return }
    Get-ChildItem $Key | Get-ItemProperty | Where-Object { -not $Name -or $_.DistributionName -ceq $Name }
}
function OutsideForeign([string]$Path, [string]$OwnName = '') {
    foreach ($Entry in @(Registrations)) {
        if ($OwnName -and $Entry.DistributionName -ceq $OwnName) { continue }
        $Base = AbsolutePath ($Entry.BasePath -replace '^\\\\\?\\', '')
        Require (-not ($Path.Equals($Base, [StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($Base + '\', [StringComparison]::OrdinalIgnoreCase))) 'INFRA_FOREIGN_DISTRO_STORAGE_REFUSED'
    }
}
function ReportNamespace([string]$Path, [string]$OwnName = '') {
    Require ($Path -ceq (AbsolutePath $Path) -and $Path.StartsWith($script:Temp + '\', [StringComparison]::OrdinalIgnoreCase)) 'INFRA_CI_REPORT_NAMESPACE_REQUIRED'
    NoReparse (Split-Path $Path -Parent)
    OutsideForeign $Path $OwnName
}
function SaveRecovery($Record) {
    NoReparse $Record.root
    if (Test-Path -LiteralPath $Record.recovery) { RegularFile $Record.recovery }
    $Pending = Join-Path $Record.root ('record-' + [guid]::NewGuid().ToString() + '.pending')
    $Stream = [IO.File]::Open($Pending, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $Bytes = [Text.Encoding]::UTF8.GetBytes(($Record | ConvertTo-Json) + "`n")
        $Stream.Write($Bytes, 0, $Bytes.Length)
        $Stream.Flush($true)
    } finally { $Stream.Dispose() }
    # Atomic replacement retains the previous durable record if an update is interrupted.
    [IO.File]::Move($Pending, $Record.recovery, $true)
}
function OwnedRecovery($Entry, [string]$EntryPath) {
    Require ($Entry.name -cmatch '^OrchestraCI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') 'INFRA_OWN_NAME_INVALID'
    Require ((AbsolutePath $Entry.root) -ceq (Join-Path $script:Temp $Entry.name)) 'INFRA_OWN_ROOT_INVALID'
    NoReparse $Entry.root
    $RecoveryPath = Join-Path $Entry.root 'recovery.json'
    RegularFile $RecoveryPath
    $Record = Get-Content -LiteralPath $RecoveryPath -Raw | ConvertFrom-Json
    Require ($Record.name -ceq $Entry.name -and $Record.root -ceq $Entry.root -and $Record.recovery -ceq $RecoveryPath -and $Record.account -ceq $script:Account) 'INFRA_OWN_RECOVERY_MISMATCH'
    Require ($Record.state -cin @('prepared', 'importAttempt', 'imported') -and $Record.namespace -ceq 'PUB-NS-001') 'INFRA_OWN_RECOVERY_STATE_INVALID'
    Require ($Record.nonce -cmatch '^[0-9a-f-]{36}$' -and $Record.version -in @(1, 2)) 'INFRA_OWN_RECOVERY_IDENTITY_INVALID'
    ReportNamespace $Record.report $Record.name
    if ($EntryPath -cne $RecoveryPath) {
        Require ($EntryPath -ceq $Record.report) 'INFRA_OWN_REPORT_PATH_MISMATCH'
        RegularFile $EntryPath
        Require ($Entry.account -ceq $Record.account -and $Entry.ownership -ceq $Record.nonce -and (Get-FileHash -LiteralPath $EntryPath -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $Record.reportHash) 'INFRA_OWN_REPORT_REPLACED'
    }
    return $Record
}
function RemoveOwned($Record, [bool]$KeepRecovery = $false) {
    $Owned = OwnedRecovery $Record $Record.recovery
    Require ($Owned.nonce -ceq $Record.nonce -and $Owned.account -ceq $Record.account -and $Owned.report -ceq $Record.report) 'INFRA_CURRENT_RECOVERY_REPLACED'
    $Record = $Owned
    OutsideForeign $Record.root $Record.name
    $Entries = @(Registrations $Record.name)
    $Names = (Wsl @('--list', '--quiet') 'INFRA_CLEANUP_LIST_REQUIRED') -split '\r?\n'
    Require ($Entries.Count -le 1 -and ($Names -ccontains $Record.name) -eq ($Entries.Count -eq 1)) 'INFRA_CLEANUP_REGISTRATION_LIST_MISMATCH'
    if ($Entries.Count -eq 1) {
        Require ($Record.state -cne 'prepared') 'INFRA_UNEXPECTED_PREIMPORT_REGISTRATION'
        Require ((AbsolutePath ($Entries[0].BasePath -replace '^\\\\\?\\', '')) -ceq (Join-Path $Record.root 'guest') -and $Entries[0].Version -eq $Record.version) 'INFRA_REGISTRATION_ROOT_OR_VERSION_MISMATCH'
        NoReparse (Join-Path $Record.root 'guest')
        $null = Wsl @('--terminate', $Record.name) 'INFRA_OWN_TERMINATE_FAILED' 30
        $null = Wsl @('--unregister', $Record.name) 'INFRA_OWN_UNREGISTER_FAILED' 60
        Require (@(Registrations $Record.name).Count -eq 0 -and -not ((Wsl @('--list', '--quiet') 'INFRA_CLEANUP_CONFIRM_LIST_REQUIRED') -split '\r?\n' -ccontains $Record.name)) 'INFRA_OWN_UNREGISTER_UNCONFIRMED'
        # Confirmed unregister; persist retryable state for ordinary leftover removal.
        $Record.state = 'imported'
        SaveRecovery $Record
    } else {
        # Killing wsl.exe does not prove a service-side import stopped or cannot finish.
        Require ($Record.state -cne 'importAttempt') 'INFRA_IMPORT_RECONCILIATION_UNRESOLVED_EXTERNAL_JANITOR_REQUIRED'
    }
    if ($KeepRecovery) { return } # Guest reconciled; another finalization failure still needs recovery.
    # WSL removes WSL1 Linux symlinks first. Refuse reparse points in leftovers.
    $Pending = [Collections.Generic.Stack[string]]::new()
    $Pending.Push($Record.root)
    while ($Pending.Count) {
        Get-ChildItem -LiteralPath $Pending.Pop() -Force | ForEach-Object {
            Require (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'INFRA_OWN_TREE_REPARSE_REFUSED'
            if ($_.PSIsContainer) { $Pending.Push($_.FullName) }
        }
    }
    # Retain recovery until guest and all other leftovers have been removed.
    Get-ChildItem -LiteralPath $Record.root -Force | Where-Object { $_.FullName -cne $Record.recovery } | Remove-Item -Recurse -Force
    try {
        [IO.File]::Delete($Record.recovery)
        [IO.Directory]::Delete($Record.root)
    } catch {
        # Ordinary directory-removal failure keeps a valid cleanup entrypoint.
        if ([IO.Directory]::Exists($Record.root)) { SaveRecovery $Record }
        throw
    }
}
function RemoveFailedReport($Record) {
    if (-not (Test-Path -LiteralPath $Record.report)) { return }
    # Identity/content check in the declared stable namespace, not an anti-race ACL claim.
    try {
        ReportNamespace $Record.report $Record.name
        RegularFile $Record.report
        $Entry = Get-Content -LiteralPath $Record.report -Raw | ConvertFrom-Json
        Require ($Record.account -ceq $script:Account -and $Entry.account -ceq $Record.account -and $Entry.name -ceq $Record.name -and $Entry.root -ceq $Record.root -and $Entry.ownership -ceq $Record.nonce) 'INFRA_CURRENT_REPORT_IDENTITY_MISMATCH'
        Require ((Get-FileHash -LiteralPath $Record.report -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $Record.reportHash) 'INFRA_CURRENT_REPORT_HASH_MISMATCH'
    } catch { throw "INFRA_FAILED_REPORT_REPLACED_OR_MALFORMED:$($_.Exception.Message)" }
    Remove-Item -LiteralPath $Record.report
}

Require ($PSVersionTable.PSVersion -ge [version]'7.3' -and [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) 'INFRA_NATIVE_WINDOWS_PWSH73_REQUIRED'
$HostCPU = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
Require ($HostCPU -in @('x64', 'arm64') -and [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant() -ceq $HostCPU) 'INFRA_NATIVE_HOST_CPU_REQUIRED'
$Account = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$WslExe = Join-Path $env:SystemRoot 'System32\wsl.exe'
RegularFile $WslExe
Require (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) 'INFRA_CI_REPORT_NAMESPACE_REQUIRED'
$Temp = AbsolutePath $env:RUNNER_TEMP
NoReparse $Temp
Require (Test-Path -LiteralPath $Temp -PathType Container) 'INFRA_TEMP_DIRECTORY_REQUIRED'
$ReportPath = AbsolutePath $Report
ReportNamespace $ReportPath
OutsideForeign $Temp
if ($Cleanup) {
    RegularFile $ReportPath
    $Entry = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
    $Record = OwnedRecovery $Entry $ReportPath
    $Failures = [Collections.Generic.List[string]]::new()
    if ($ReportPath -ceq $Record.recovery) {
        try { RemoveFailedReport $Record } catch { $Failures.Add("report:$($_.Exception.Message)") }
    }
    try { RemoveOwned $Record ($Failures.Count -gt 0) }
    catch { $Failures.Add("guest:$($_.Exception.Message)") }
    Require ($Failures.Count -eq 0) "INFRA_CLEANUP_BLOCKED:recovery=$($Record.recovery); failures=$($Failures -join '; ')"
    return
}
Require ($Sha256 -cmatch '^[0-9a-f]{64}$') 'INFRA_ROOTFS_SHA256_INVALID'
$RootfsPath = AbsolutePath $Rootfs
RegularFile $RootfsPath
OutsideForeign $RootfsPath
Require (-not (Test-Path -LiteralPath $ReportPath)) 'INFRA_REPORT_NOT_FRESH'
Require ($RootfsPath -ine $ReportPath) 'INFRA_REPORT_ROOTFS_COLLISION'
Require (-not (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -and -not (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')) 'INFRA_HOST_REBOOT_REQUIRED'
try {
    $Feature = if ($Version -eq 1) { 'Microsoft-Windows-Subsystem-Linux' } else { 'VirtualMachinePlatform' }
    $FeatureState = (Get-WindowsOptionalFeature -Online -FeatureName $Feature).State
} catch { throw 'INFRA_WSL_FEATURE_QUERY_REQUIRED' }
Require ($FeatureState -eq 'Enabled') 'INFRA_WSL_FEATURE_OR_REBOOT_REQUIRED'
$null = Wsl @('--status') 'INFRA_WSL_KERNEL_OR_READINESS_REQUIRED'
$Name = 'OrchestraCI-' + [guid]::NewGuid().ToString()
$Root = Join-Path $Temp $Name
OutsideForeign $Root
Require (-not (Test-Path -LiteralPath $Root)) 'INFRA_OWN_ROOT_NOT_FRESH'
Require (@(Registrations $Name).Count -eq 0 -and -not ((Wsl @('--list', '--quiet') 'INFRA_WSL_LIST_REQUIRED') -split '\r?\n' -ccontains $Name)) 'INFRA_OWN_NAME_COLLISION'
$Record = $null
$InputStream = $null
$ReportStream = $null
$ReportCreated = $false
$Completed = $false
try {
    $InputStream = [IO.File]::Open($RootfsPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { $Hash = [BitConverter]::ToString($Hasher.ComputeHash($InputStream)).Replace('-', '').ToLowerInvariant() } finally { $Hasher.Dispose() }
    Require ($Hash -ceq $Sha256) 'INFRA_ROOTFS_DIGEST_MISMATCH'
    $null = New-Item -ItemType Directory -Path $Root
    $Record = [ordered]@{
        name = $Name; root = $Root; recovery = (Join-Path $Root 'recovery.json'); report = $ReportPath
        account = $Account; nonce = [guid]::NewGuid().ToString(); namespace = 'PUB-NS-001'
        state = 'prepared'; hash = $Hash; version = $Version; reportHash = ''
        boundary = 'Infrastructure only; controlled CI cooperating publisher/account; external janitor required after hard kill'
    }
    SaveRecovery $Record
    Write-Output "INFRA_RECOVERY_ENTRYPOINT:$($Record.recovery)"
    $Record.state = 'importAttempt'
    SaveRecovery $Record
    $null = Wsl @('--import', $Name, (Join-Path $Root 'guest'), $RootfsPath, '--version', "$Version") 'INFRA_WSL_IMPORT_FEATURE_REBOOT_KERNEL_OR_ROOTFS_BLOCKER' 180
    $Record.state = 'imported'
    SaveRecovery $Record
    $Entries = @(Registrations $Name)
    Require ($Entries.Count -eq 1 -and $Entries[0].Version -eq $Version -and (AbsolutePath ($Entries[0].BasePath -replace '^\\\\\?\\', '')) -ceq (Join-Path $Root 'guest')) 'INFRA_IMPORTED_ROOT_OR_VERSION_MISMATCH'
    $GuestArgs = @('--distribution', $Name, '--user', 'root', '--exec', '/usr/bin/env', '-i', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin')
    $Bash = 'test -n "$BASH_VERSION" && printf "%s\n" bash'
    Require ((Wsl ($GuestArgs + @('/bin/bash', '--noprofile', '--norc', '-c', $Bash)) 'INFRA_GUEST_BASH_REQUIRED') -ceq 'bash') 'INFRA_GUEST_BASH_REQUIRED'
    # A trailing builtin keeps Bash alive while od opens /proc/$$/exe (no last-command exec).
    $Probe = 'set -eu; for c in env uname getconf sha256sum timeout mktemp mkdir cp chmod mv rm sleep wslpath stat touch od; do command -v "$c" >/dev/null || { printf "INFRA_GUEST_COMMAND_REQUIRED:%s\n" "$c"; exit 90; }; done; uname -m; getconf GNU_LIBC_VERSION; od -An -v -tu1 -N20 "/proc/$$/exe"; :'
    $ProbeOutput = (Wsl ($GuestArgs + @('/bin/bash', '--noprofile', '--norc', '-c', $Probe)) 'INFRA_GUEST_COMMAND_GLIBC_OR_ELF_REQUIRED') -split '\r?\n'
    $GuestCPU = if ($HostCPU -eq 'x64') { 'x86_64' } else { 'aarch64' }
    Require ($ProbeOutput.Count -ge 3 -and $ProbeOutput[0] -ceq $GuestCPU) 'INFRA_FOREIGN_GUEST_KERNEL_CPU_REFUSED'
    Require ($ProbeOutput[1] -cmatch '^glibc [0-9]+\.[0-9]+$') 'INFRA_GUEST_GLIBC_REQUIRED'
    $Elf = (($ProbeOutput[2..($ProbeOutput.Count - 1)] -join ' ').Trim() -split '\s+')
    Require ($Elf.Count -eq 20 -and @($Elf | Where-Object { $_ -notmatch '^\d{1,3}$' -or [int]$_ -gt 255 }).Count -eq 0) 'INFRA_BASH_ELF_HEADER_INVALID'
    Require (($Elf[0..5] -join ',') -ceq '127,69,76,70,2,1' -and $Elf[6] -ceq '1') 'INFRA_BASH_ELF64_LITTLE_ENDIAN_REQUIRED'
    $Machine = [int]$Elf[18] + 256 * [int]$Elf[19]
    Require ($Machine -eq $(if ($HostCPU -eq 'x64') { 62 } else { 183 })) 'INFRA_FOREIGN_EXECUTING_BASH_REFUSED'
    $Interop = 'set -eu; p=$(wslpath -u "$1"); test -x "$p"; "$p" /d /c exit 0'
    $null = Wsl ($GuestArgs + @('/bin/bash', '--noprofile', '--norc', '-c', $Interop, 'interop', (Join-Path $env:SystemRoot 'System32\cmd.exe'))) 'INFRA_GUEST_INTEROP_REQUIRED'
    $Evidence = [ordered]@{
        name = $Name; root = $Root; ownership = $Record.nonce; account = $Account; nativeHost = "windows-$HostCPU"
        guest = $GuestCPU; ABI = $ProbeOutput[1]; bashElfMachine = $Machine; hash = $Hash; version = $Version
        digestVerified = $true; registrationVerified = $true; nativeBashVerified = $true
        bashVerified = $true; commandsVerified = $true; glibcVerified = $true; interopVerified = $true
        boundary = 'Infrastructure only, not A04; hash is not publisher certification; PUB-NS-001 controlled cooperating publisher/account'
    }
    $Bytes = [Text.Encoding]::UTF8.GetBytes(($Evidence | ConvertTo-Json) + "`n")
    $Record.reportHash = Digest $Bytes
    SaveRecovery $Record
    $ReportStream = [IO.File]::Open($ReportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $ReportCreated = $true
    $ReportStream.Write($Bytes, 0, $Bytes.Length)
    $ReportStream.Flush($true)
    $ReportStream.Dispose(); $ReportStream = $null
    RegularFile $ReportPath
    $Verified = OwnedRecovery (Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json) $ReportPath
    Require ($Verified.nonce -ceq $Record.nonce -and $Verified.account -ceq $Record.account -and $Verified.name -ceq $Record.name -and $Verified.root -ceq $Record.root) 'INFRA_CURRENT_REPORT_REPLACED'
    $Completed = $true
} catch { throw "INFRA_PREPARATION_FAILED:recovery=$(Join-Path $Root 'recovery.json'); failure=$($_.Exception.Message)" }
finally {
    # Includes cooperative cancellation. Hard termination is explicitly janitor-owned.
    $Failures = [Collections.Generic.List[string]]::new()
    try {
        try { StopLauncher } catch { $Failures.Add("launcher:$($_.Exception.Message)") }
        try { if ($null -ne $ReportStream) { $ReportStream.Dispose(); $ReportStream = $null } }
        catch { $Failures.Add("report-close:$($_.Exception.Message)") }
        if (-not $Completed -and $null -ne $Record) {
            try { if ($ReportCreated) { RemoveFailedReport $Record } }
            catch { $Failures.Add("report:$($_.Exception.Message)") }
            try { RemoveOwned $Record ($Failures.Count -gt 0) }
            catch { $Failures.Add("guest:$($_.Exception.Message)") }
        }
        Require ($Failures.Count -eq 0) "INFRA_RECOVERY_REQUIRED:entrypoint=$(Join-Path $Root 'recovery.json'); failures=$($Failures -join '; ')"
    }
    finally {
        if ($null -ne $InputStream) { $InputStream.Dispose() }
        if ($null -ne $ReportStream) { $ReportStream.Dispose() }
    }
}
