# Source-only infrastructure helper. Execute only with an operator-approved local rootfs.
# SHA256 checks bytes, not publisher provenance. This is not A04 product/auth evidence.
# WSL registrations belong to the Windows runner account, not the machine globally.
# Command contract: https://learn.microsoft.com/en-us/windows/wsl/basic-commands
# Requires native PowerShell 7.3+; never enables features, reboots, updates, or downloads.
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
$PSNativeCommandUseErrorActionPreference = $false
$PSNativeCommandArgumentPassing = 'Standard'

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
function Wsl([string[]]$Arguments, [string]$Failure) {
    $Output = @(& $script:WslExe @Arguments 2>$null)
    Require ($LASTEXITCODE -eq 0) $Failure
    return (($Output -join "`n") -replace "`0", '').Trim()
}
function Registration([string]$Name) {
    $Entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue |
        Get-ItemProperty | Where-Object { $_.DistributionName -ceq $Name })
    Require ($Entries.Count -eq 1) 'INFRA_OWN_REGISTRATION_REQUIRED'
    return $Entries[0]
}
function OwnedRoot([string]$Name, [string]$Root) {
    Require ($Name -cmatch '^OrchestraCI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') 'INFRA_OWN_NAME_INVALID'
    Require ($Root -ceq (Join-Path $script:Temp $Name)) 'INFRA_OWN_ROOT_INVALID'
    NoReparse $Root
    $MarkerPath = Join-Path $Root 'owner.json'
    NoReparse $MarkerPath
    $Marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
    Require ($Marker.name -ceq $Name -and $Marker.root -ceq $Root -and $Marker.report -ceq $script:ReportPath -and $Marker.account -ceq $script:Account) 'INFRA_OWN_MARKER_MISMATCH'
    return $Marker
}
function RemoveOwned([string]$Name, [string]$Root, [bool]$Registered) {
    $null = OwnedRoot $Name $Root
    if ($Registered) {
        $Entry = Registration $Name
        Require ((AbsolutePath ($Entry.BasePath -replace '^\\\\\?\\', '')) -ceq (Join-Path $Root 'guest')) 'INFRA_REGISTRATION_ROOT_MISMATCH'
        NoReparse (Join-Path $Root 'guest')
        $Names = (Wsl @('--list', '--quiet') 'INFRA_WSL_LIST_REQUIRED') -split '\r?\n'
        Require ($Names -ccontains $Name) 'INFRA_OWN_DISTRO_NOT_LISTED'
        $null = Wsl @('--unregister', $Name) 'INFRA_OWN_UNREGISTER_FAILED'
        Require (-not ((Wsl @('--list', '--quiet') 'INFRA_WSL_LIST_REQUIRED') -split '\r?\n' -ccontains $Name)) 'INFRA_OWN_UNREGISTER_UNCONFIRMED'
    }
    # WSL removes its guest first (WSL1 Linux symlinks can be reparse points).
    # Reject links in any leftovers before PowerShell recursive deletion.
    $Pending = [Collections.Generic.Stack[string]]::new()
    $Pending.Push($Root)
    while ($Pending.Count) {
        Get-ChildItem -LiteralPath $Pending.Pop() -Force | ForEach-Object {
            Require (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'INFRA_OWN_TREE_REPARSE_REFUSED'
            if ($_.PSIsContainer) { $Pending.Push($_.FullName) }
        }
    }
    Remove-Item -LiteralPath $Root -Recurse -Force
}

Require ($PSVersionTable.PSVersion -ge [version]'7.3' -and [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)) 'INFRA_NATIVE_WINDOWS_PWSH73_REQUIRED'
$HostCPU = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
Require ($HostCPU -in @('x64', 'arm64') -and [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant() -ceq $HostCPU) 'INFRA_NATIVE_HOST_CPU_REQUIRED'
$Account = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$WslExe = Join-Path $env:SystemRoot 'System32\wsl.exe'
Require (Test-Path -LiteralPath $WslExe -PathType Leaf) 'INFRA_WSL_TOOL_REQUIRED'
$Temp = AbsolutePath $(if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() })
NoReparse $Temp
Require (Test-Path -LiteralPath $Temp -PathType Container) 'INFRA_TEMP_DIRECTORY_REQUIRED'
$ReportPath = AbsolutePath $Report
NoReparse (Split-Path $ReportPath -Parent)
$null = Wsl @('--list', '--quiet') 'INFRA_WSL_READY_REQUIRED'

if ($Cleanup) {
    NoReparse $ReportPath
    $Evidence = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
    $Owned = OwnedRoot $Evidence.name (AbsolutePath $Evidence.root)
    Require ($Owned.reportHash -ceq (Get-FileHash -LiteralPath $ReportPath -Algorithm SHA256).Hash.ToLowerInvariant()) 'INFRA_OWN_REPORT_MISMATCH'
    RemoveOwned $Evidence.name $Evidence.root $true
    return
}

Require ($Sha256 -cmatch '^[0-9a-f]{64}$') 'INFRA_ROOTFS_SHA256_INVALID'
$RootfsPath = AbsolutePath $Rootfs
Require (Test-Path -LiteralPath $RootfsPath -PathType Leaf) 'INFRA_REGULAR_ROOTFS_REQUIRED'
NoReparse $RootfsPath
Require ((Get-Item -LiteralPath $RootfsPath -Force) -is [IO.FileInfo]) 'INFRA_REGULAR_ROOTFS_REQUIRED'
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
Require (-not (Test-Path -LiteralPath $Root)) 'INFRA_OWN_ROOT_NOT_FRESH'
Require (-not ((Wsl @('--list', '--quiet') 'INFRA_WSL_LIST_REQUIRED') -split '\r?\n' -ccontains $Name)) 'INFRA_OWN_NAME_COLLISION'
$InputStream = $null
$ReportStream = $null
$Created = $false
$ImportAttempted = $false
$ReportCreated = $false
$Completed = $false
try {
    # Hold a read-only sharing lock through import: no replacement after digest verification.
    $InputStream = [IO.File]::Open($RootfsPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { $Digest = [BitConverter]::ToString($Hasher.ComputeHash($InputStream)).Replace('-', '').ToLowerInvariant() } finally { $Hasher.Dispose() }
    Require ($Digest -ceq $Sha256) 'INFRA_ROOTFS_DIGEST_MISMATCH'
    $ReportStream = [IO.File]::Open($ReportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $ReportCreated = $true
    $null = New-Item -ItemType Directory -Path $Root
    $Created = $true
    $Marker = @{ name = $Name; root = $Root; report = $ReportPath; account = $Account; reportHash = '' }
    $Marker | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'owner.json') -Encoding utf8
    $ImportAttempted = $true
    $null = Wsl @('--import', $Name, (Join-Path $Root 'guest'), $RootfsPath, '--version', "$Version") 'INFRA_WSL_IMPORT_FEATURE_REBOOT_KERNEL_OR_ROOTFS_BLOCKER'
    $Entry = Registration $Name
    Require ($Entry.Version -eq $Version -and (AbsolutePath ($Entry.BasePath -replace '^\\\\\?\\', '')) -ceq (Join-Path $Root 'guest')) 'INFRA_IMPORTED_ROOT_OR_VERSION_MISMATCH'
    $GuestArgs = @('--distribution', $Name, '--user', 'root', '--exec', '/usr/bin/env', '-i', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin')
    $GuestCPU = Wsl ($GuestArgs + @('/bin/uname', '-m')) 'INFRA_GUEST_ENV_UNAME_OR_KERNEL_REQUIRED'
    Require ($GuestCPU -ceq $(if ($HostCPU -eq 'x64') { 'x86_64' } else { 'aarch64' })) 'INFRA_FOREIGN_GUEST_CPU_REFUSED'
    $Bash = 'test -n "$BASH_VERSION" && printf "%s\n" bash'
    Require ((Wsl ($GuestArgs + @('/bin/bash', '--noprofile', '--norc', '-c', $Bash)) 'INFRA_GUEST_BASH_REQUIRED') -ceq 'bash') 'INFRA_GUEST_BASH_REQUIRED'
    $Probe = 'set -eu; for c in env uname getconf sha256sum timeout mktemp mkdir cp chmod mv rm sleep wslpath stat touch; do command -v "$c" >/dev/null || { printf "INFRA_GUEST_COMMAND_REQUIRED:%s\n" "$c"; exit 90; }; done; uname -m; getconf GNU_LIBC_VERSION'
    $ProbeOutput = @(& $WslExe @GuestArgs /bin/bash --noprofile --norc -c $Probe 2>$null)
    Require ($LASTEXITCODE -eq 0) $(if (($ProbeOutput -join "`n") -cmatch '^INFRA_GUEST_COMMAND_REQUIRED:[a-z0-9]+$') { $Matches[0] } else { 'INFRA_GUEST_COMMAND_OR_GLIBC_REQUIRED' })
    Require ($ProbeOutput.Count -eq 2 -and $ProbeOutput[0] -ceq $GuestCPU -and $ProbeOutput[1] -cmatch '^glibc [0-9]+\.[0-9]+$') 'INFRA_GUEST_GLIBC_REQUIRED'
    # Execute a fixed native host executable through interop, never a caller-supplied command.
    $Interop = 'set -eu; p=$(wslpath -u "$1"); test -x "$p"; "$p" /d /c exit 0'
    $null = Wsl ($GuestArgs + @('/bin/bash', '--noprofile', '--norc', '-c', $Interop, 'interop', (Join-Path $env:SystemRoot 'System32\cmd.exe'))) 'INFRA_GUEST_INTEROP_REQUIRED'
    $Evidence = [ordered]@{
        name = $Name; root = $Root; nativeHost = "windows-$HostCPU"; guest = $GuestCPU; ABI = $ProbeOutput[1]
        hash = $Digest; version = $Version; digestVerified = $true; registrationVerified = $true
        nativeGuestVerified = $true; bashVerified = $true; commandsVerified = $true; glibcVerified = $true; interopVerified = $true
        boundary = 'Infrastructure only; not A04 product installation or authenticated health; hash is not publisher certification'
    }
    $Bytes = [Text.Encoding]::UTF8.GetBytes(($Evidence | ConvertTo-Json) + "`n")
    $ReportStream.Write($Bytes, 0, $Bytes.Length)
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try { $Marker.reportHash = [BitConverter]::ToString($Hasher.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() } finally { $Hasher.Dispose() }
    $Marker | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'owner.json') -Encoding utf8
    $ReportStream.Dispose(); $ReportStream = $null
    $Completed = $true
} catch {
    $Failure = $_
    if ($Created) {
        try {
            $Registered = $false
            if ($ImportAttempted) {
                $Names = (Wsl @('--list', '--quiet') 'INFRA_FAILURE_CLEANUP_LIST_REQUIRED') -split '\r?\n'
                $Entries = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DistributionName -ceq $Name })
                $Registered = $Entries.Count -gt 0
                Require (($Names -ccontains $Name) -eq $Registered) 'INFRA_FAILURE_REGISTRATION_LIST_MISMATCH'
            }
            RemoveOwned $Name $Root $Registered
        } catch { throw "INFRA_FAILURE_CLEANUP_BLOCKED:$Name; original=$($Failure.Exception.Message); cleanup=$($_.Exception.Message)" }
    }
    throw "INFRA_PREPARATION_FAILED:$($Failure.Exception.Message)"
} finally {
    if ($null -ne $InputStream) { $InputStream.Dispose() }
    if ($null -ne $ReportStream) { $ReportStream.Dispose() }
    if ($ReportCreated -and -not $Completed) { Remove-Item -LiteralPath $ReportPath -Force }
}
