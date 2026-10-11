# The QA harness on Windows (qa/README.md): .\qa\run.ps1 --quick | --full [--lang rust,ts] [--inject-orphan]
# Builds omni-qa into the repository's target dir and runs it; it builds the rest and writes qa\out\report.{json,md}.
# The exit code is omni-qa's (no $ErrorActionPreference = "Stop": the harness reports progress on stderr).
Set-Location (Split-Path -Parent $PSScriptRoot)
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { "target" }
cargo run --release --quiet --manifest-path qa/Cargo.toml --target-dir $target -- @args
exit $LASTEXITCODE
