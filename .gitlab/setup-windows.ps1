$ErrorActionPreference = "Stop"
if (!$env:GITLAB_CI -or !$env:CI_JOB_ID -or !$env:CI_PROJECT_DIR) {
    throw "Windows setup requires an isolated GitLab job checkout."
}
$tools = Join-Path $env:TEMP "orchestra-tools-$env:CI_JOB_ID"
New-Item -ItemType Directory -Force -Path $tools | Out-Null
# Pin after all setup: Node 24.16 hangs extracting Playwright 1.59 Chromium.
Invoke-WebRequest "https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip" -OutFile "$tools/node.zip"
Expand-Archive "$tools/node.zip" -DestinationPath $tools -Force
$version = (Get-Content package.json -Raw | ConvertFrom-Json).packageManager.Split('@')[1]
Invoke-WebRequest "https://github.com/oven-sh/bun/releases/download/bun-v$version/bun-windows-x64-baseline.zip" -OutFile "$tools/bun.zip"
Expand-Archive "$tools/bun.zip" -DestinationPath $tools -Force
Copy-Item "$tools/bun-windows-x64-baseline/bun.exe" "$tools/bun-windows-x64-baseline/bunx.exe"
$env:PATH = "$tools/node-v24.15.0-win-x64;$tools/bun-windows-x64-baseline;$env:PATH"
if ((node --version) -ne "v24.15.0") { throw "Unexpected Node version" }
if ((bun --version) -ne $version) { throw "Unexpected Bun version" }
if ((bunx --version) -ne $version) { throw "Unexpected bunx version" }
node --version
bun --version
python -m pip install setuptools
if ($LASTEXITCODE -ne 0) { throw "setuptools installation failed" }

# Preserve setup-bun's five clean-cache attempts for patched-package rename races.
$cache = Join-Path $env:CI_PROJECT_DIR ".bun-install-cache"
try {
    foreach ($attempt in 1..5) {
        if (Test-Path $cache) { Remove-Item $cache -Recurse -Force }
        if (Test-Path node_modules) { Remove-Item node_modules -Recurse -Force }
        bun install --no-cache --cache-dir $cache --linker hoisted
        if ($LASTEXITCODE -eq 0) { return }
        Write-Warning "bun install attempt $attempt failed; retrying from an empty cache"
    }
    throw "bun install failed after five clean-cache attempts"
} finally {
    if (Test-Path $cache) { Remove-Item $cache -Recurse -Force }
}
