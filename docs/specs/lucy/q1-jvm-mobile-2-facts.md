# Q1 jvm-mobile source facts — 2

Upstream source facts for six future analysis candidates. Not a live Orchestra integration, lane, noexec or offline claim, or redistribution approval. A license hash is not an artifact hash. Publisher digests were not re-hashed locally. Signatures are unverified. An unknown prerequisite hash is not an installable binary.

## PMD 7.29.0

- Artifact: GitHub `pmd_releases/7.29.0` zip `pmd-dist-7.29.0-bin.zip`, publisher sha256 `d27177c185b837fa57f097e482d1253468aa035379c5eb2671fa0a279109b179` (2026-10-30). Scripts `pmd` / `pmd.bat`, not a native binary. Zip digest is not the LICENSE hash.
- License: `LicenseRef-PMD-BSD` (custom BSD-style core; full file also has Apache-2.0 and bundled notices). Text SHA256 `296dae48eae5658f449a89cf512b8e05386c9c5adfb23d74cfb24efa145625db`. https://raw.githubusercontent.com/pmd/pmd/pmd_releases/7.29.0/LICENSE. No SPDX equivalence. Notice retention, DARPA acknowledgement in supplied docs, and non-endorsement are conditions, not clearance.
- Use: Ruleset analysis: `pmd check -d <dir> -R <ruleset.xml> -f text`. `-R` is required (file, classpath, or URL); default format is text. Script starts `net.sourceforge.pmd.cli.PmdCli`. Needs a trusted JVM; `CLASSPATH` and `PMD_JAVA_OPTS` affect the launch.
- Output/exits: Text on stdout; `-r` creates the report. Tag 7.29.0 `System.exit`: 0 OK, 1 ERROR, 2 usage error, 4 if violations and fail-on-violation (default; `--no-fail-on-violation` is 0), 5 if recovered errors and fail-on-error (default).
- Effects: Config: ruleset may name local, classpath, or URL resources; `--cache` creates and overwrites; `--aux-classpath`. Network: `-R` may be a URL; no other fetch in `PmdCommand`. Children: that JVM, plus Unix `java -version` and `java -XshowSettings:properties`. Writes: report file and cache file.
- Limits: Third-party jars and notices remain a packaging duty. No signature proof. Not redistribution, offline use, or a lane approval. Not every flag is listed.

Sources: https://github.com/pmd/pmd/releases/tag/pmd_releases/7.29.0 ; https://github.com/pmd/pmd/blob/pmd_releases/7.29.0/pmd-cli/src/main/java/net/sourceforge/pmd/cli/internal/CliExitCode.java ; https://github.com/pmd/pmd/blob/pmd_releases/7.29.0/pmd-cli/src/main/java/net/sourceforge/pmd/cli/commands/internal/PmdCommand.java

## CPD 7.29.0

- Artifact: Same zip `pmd-dist-7.29.0-bin.zip`, publisher sha256 `d27177c185b837fa57f097e482d1253468aa035379c5eb2671fa0a279109b179`. Invoked as `pmd cpd` / `pmd.bat`. Not a separate native binary. Zip digest is not the license hash.
- License: Same `LicenseRef-PMD-BSD` and LICENSE SHA256 `296dae48eae5658f449a89cf512b8e05386c9c5adfb23d74cfb24efa145625db`. https://raw.githubusercontent.com/pmd/pmd/pmd_releases/7.29.0/LICENSE. Notice retention, DARPA acknowledgement, and non-endorsement apply. No SPDX equivalence or redistribution clearance.
- Use: Copy-paste detection: `pmd cpd --minimum-tokens 100 -d <dir>`. `--minimum-tokens` is required. Default language java; default renderer text. Same script and `PmdCli` as PMD. No ruleset file. Needs a trusted JVM; `CLASSPATH` and `PMD_JAVA_OPTS` affect the launch.
- Output/exits: Text duplication report on stdout; `-r` writes it. Exits: 0 if no matches and no failing errors; 4 if matches and fail-on-violation (default); 5 if reporter errors and fail-on-error (default); 1 on IO or runtime exception. Other renderers exist and are not listed.
- Effects: Config: CLI flags only. Network: the selected local-directory argv reads local inputs; other inputs or runtime have no offline guarantee. Children: same JVM launch and Unix java discovery commands. Writes: `-r` report only; this path does not rewrite sources.
- Limits: Not a distinct published binary. A withdrawn database-URI note is not a fact. No signature proof. Not an integration, offline, or redistribution approval.

Sources: https://github.com/pmd/pmd/blob/pmd_releases/7.29.0/pmd-cli/src/main/java/net/sourceforge/pmd/cli/commands/internal/CpdCommand.java ; https://github.com/pmd/pmd/blob/pmd_releases/7.29.0/pmd-core/src/main/java/net/sourceforge/pmd/cpd/CPDConfiguration.java ; https://github.com/pmd/pmd/releases/tag/pmd_releases/7.29.0

## japicmp 0.27.0

- Artifact: Maven Central `japicmp:0.27.0` `jar-with-dependencies`, published sha256 `1b69870198a6d321139f3cfa9f47ccbf3eea4b91167fefd3c69c77e9cc213917` (sha1 `50543395d570eef7ed5672be20852c05a4849371`). Same jar is a GitHub asset on `japicmp-base-0.27.0`; GitHub API digest was null. Not a native binary. Not a local rehash, not the license hash, not a verified signature.
- License: Apache-2.0. Tagged LICENSE SHA256 `73ba74dfaa520b49a401b5d21459a8523a146f3b7518a833eea5efa85130bf68`. https://raw.githubusercontent.com/siom79/japicmp/japicmp-base-0.27.0/LICENSE.
- Use: Jar API comparison: `java -jar japicmp-0.27.0-jar-with-dependencies.jar -n <new.jar> -o <old.jar>`. Optional `--html-file` and `-x`/`--xml-file`. Needs a JVM that can run that fat jar. The Maven plugin is a different entry point.
- Output/exits: Default stdout text. HTML and XML files only with those flags; markdown is a separate stdout flag. Success returns (exit 0, no `System.exit`). Exceptions call `exit(1)` except `JApiCmpException` with `Reason.NormalTermination`, whose status is unstated. An incompatible change uses that path only when an error-on option is set.
- Effects: Config: CLI flags for this argv. Network: this jar-to-jar argv reads local archives only; that does not cover the plugin. Children: one JVM; no child in `JApiCli.run`. Writes: stdout, or the HTML/XML files when requested.
- Limits: Integrity is the Central published digest, not a GitHub digest or local rehash. Not every flag. Not an integration or redistribution approval.

Sources: https://repo1.maven.org/maven2/com/github/siom79/japicmp/japicmp/0.27.0/japicmp-0.27.0-jar-with-dependencies.jar.sha256 ; https://github.com/siom79/japicmp/blob/japicmp-base-0.27.0/japicmp/src/main/java/japicmp/JApiCmp.java ; https://github.com/siom79/japicmp/blob/japicmp-base-0.27.0/LICENSE

## OWASP Dependency-Check 13.0.0

- Artifact: Tag `v13.0.0` (2026-08-03) zip `dependency-check-13.0.0-release.zip`, publisher sha256 `44d920d1ec03e948df862a253f0912782a31b9beee8a7c8895b9cb95760176ed`. Script is inside the zip; member checksum unpublished and zip not unpacked. Not a native analyzer. Zip digest is not the license hash.
- License: Apache-2.0. LICENSE.txt SHA256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`. https://raw.githubusercontent.com/dependency-check/DependencyCheck/v13.0.0/LICENSE.txt. NVD data is third-party and downloaded at runtime.
- Use: Vulnerability scan: `dependency-check.sh --scan <path>` (appassembler id `dependency-check`, suffix `.sh`). Default `--format` HTML; also XML, CSV, JSON, JUNIT, SARIF, JENKINS, GITLAB, ALL. `--update` updates the DB and does not scan. Prerequisite is the script's JVM.
- Output/exits: Report under the report directory. `System.exit` after the scan code. Without `--failOnCVSS` the helper returns 11, so scores 0–10 do not fail (exit 0 even if findings exist). With it, a hit sets 15; a comment saying 1 is stale. Parse error 2; missing file 1. Other paths: 3, 4, 7, 8, 9, 11, 12, 13, 14. Schema parsing was not done.
- Effects: Config: CLI flags; a properties file can override. Suppression files are optional. Network: downloader plus telemetry; NVD/hosted update is network. Not offline. Children: JVM from `dependency-check.sh`. Writes: report directory and local vulnerability DB.
- Limits: Do not treat the zip hash as the script hash. No signature proof. Not redistribution, integration, or noexec approval.

Sources: https://github.com/dependency-check/DependencyCheck/releases/tag/v13.0.0 ; https://github.com/dependency-check/DependencyCheck/blob/v13.0.0/cli/src/main/java/org/owasp/dependencycheck/App.java ; https://github.com/dependency-check/DependencyCheck/blob/v13.0.0/LICENSE.txt

## Roslynator 5.0.1

- Artifact: Release `v5.0.1` exposes assets; no standalone CLI binary was selected. Source is `src/CommandLine` and needs a .NET host to build, or an unselected tool package. `Roslynator.Analyzers` 5.0.1 nupkg sha256 `c34f0658e9219bcf615a70215be64bb9333ecfbfb6c60dd8cc7ef7be50edf580` is a computed download hash, not a publisher digest. `Roslynator.DotNet.Cli` 1.0.1 is not this tag.
- License: Apache-2.0. Tag LICENSE.txt is a notice, SHA256 `4075a95d7fb940374ed0e2d2e2336c2706353758af90e5b6ed4277527d718b34`, not the full body. Tagged notice: https://raw.githubusercontent.com/dotnet/roslynator/v5.0.1/LICENSE.txt. Cited body https://www.apache.org/licenses/LICENSE-2.0.txt SHA256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`. Nuspec also Apache-2.0. No or-later or exception declared.
- Use: Analyzer diagnostics: `roslynator analyze <project-or-solution>`, optional `--output` and `--output-format gitlab|sarif|xml`. Needs a built CLI plus dotnet/MSBuild. `--fix` is a different verb.
- Output/exits: Console counts. With `--output` and diagnostics, default file format is xml. 0 if none, or if `--return-success-on-diagnostics`; else diagnostics are 1. Parse or setup failure is 2.
- Effects: Config: project or solution, optional assemblies and severity. Network: host may restore and load analyzers; the verb hardcodes no feed. Not an offline claim. Children: dotnet and MSBuild. Writes: `--output` only; `--fix` rewrites are outside this argv.
- Limits: An unknown install hash is not an auto-install binary. Package 1.0.1 was not verified as tag 5.0.1. Not an integration or redistribution approval.

Sources: https://github.com/dotnet/roslynator/blob/v5.0.1/src/CommandLine/Program.cs ; https://github.com/dotnet/roslynator/blob/v5.0.1/src/CommandLine/Commands/AnalyzeCommand.cs ; https://www.apache.org/licenses/LICENSE-2.0.txt

## dotnet list package SDK 10.0.404 (channel 10.0 latest-sdk; also active channel 11.0 latest-sdk 11.0.100)

- Artifact: Selected osx-arm64 archive `dotnet-sdk-10.0.404-osx-arm64.tar.gz`. Metadata and sibling `.sha512` agree: publisher sha512 `1c9a13f625d0c08f08ef5a53597bababe3d2473527e98db2199210940c69dd5fc599a39a4d7c30ebf297ca2334a81b2f64b9bf05ff99585de9af4a5d85215e96`. Not re-hashed, not the license hash, not a signature. 11.0.100 noted, not selected. SDK command, not a separate package.
- License: MIT. LICENSE.TXT SHA256 `cfc21f5e8bd655ae997eec916138b707b1d290b83272c02a95c9f821b8c87310`. https://raw.githubusercontent.com/dotnet/sdk/v10.0.404/LICENSE.TXT. Audit matched the tag bytes. Source text, not an installer EULA. Notices unhashed; bundling unqualified.
- Use: List package references, with optional vulnerable and transitive views. `dotnet package list [--vulnerable] [--include-transitive] [--format console|json] [--no-restore] [--project <path>]`; hidden alias `dotnet list package [project]`. Pinned NuGet.CommandLine.XPlat 7.9.0-rc.48109 (`fa716c8f9bde4602cfc3acd6748e3f4ae0c2dcfb`). No runtime run.
- Output/exits: Table or json is the NuGet renderer. Json restore failure prints a version-1 problems object. Non-zero restore is returned. Multiple projects or solutions, a missing file, `--file` with `--project`, and restore exceptions exit 1. Else 0 unless `ProblemType.Error`. Vulnerability count is not the exit; mapping unread.
- Effects: Config: NuGet.config, `--config`, `--project`/`--file`, `--no-restore`, `--format`, `--interactive`, `--source`. Plugin execution unproved. Network: restore fetches unless `--no-restore`; `--vulnerable`/`--outdated` still use package and audit source network. Not offline-safe. Children: MSBuild or virtual-project restore; `NuGet.CommandLine.XPlat.dll` or in-process. Restore may run project code. Writes: assets/obj unless `--no-restore`; stdout only.
- Limits: Tarball SHA-256 unknown. Findings are not a proved failing exit. Not an integration, offline, or redistribution approval.

Sources: https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.404/dotnet-sdk-10.0.404-osx-arm64.tar.gz.sha512 ; https://raw.githubusercontent.com/dotnet/sdk/v10.0.404/LICENSE.TXT ; https://raw.githubusercontent.com/dotnet/sdk/v10.0.404/src/Cli/dotnet/Commands/Package/List/PackageListCommand.cs
