# Q1 jvm-mobile source facts — 1

Upstream source facts for six future JVM analysis tools. Not live Orchestra integrations, lanes, no-exec or offline approvals, or redistribution certificates. A license SHA-256 is not an artifact hash. A publisher digest is not a local rehash. No signature is verified unless the packet proved one. An unhashed JDK or other prerequisite is not an auto-install binary.

## Error Prone 2.52.0

- **Artifact:** v2.52.0 (2026-11-02) has no GitHub assets. Selected Maven `error_prone_core:2.52.0` `with-dependencies` publisher sha256 `3efb5a1d65ebcb68dd8dfb228f0c05943a551b5d740455bf166df6e0e302b6bb` (sha1 `41e96e393cd60b2f91455ffd63d4d091f8c6420e`). `dataflow-errorprone:3.41.0-eisop1` published sha256 `10434fba4e53f55fa9c76904cde414b918932548c9dfc4e2d634ac05ff7a7d10`; local hash matched it and sha1 `3fc86eff95c549e42c41fd7c01c2a57ed46a5a94`. Plugin, not a binary.
- **License:** Apache-2.0. COPYING sha256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` (hashMatched; license text, not the jar): https://raw.githubusercontent.com/google/error-prone/v2.52.0/COPYING. Bundled dataflow LICENSE.txt sha256 `4749812a24c2c8f4ec30fd532a3556ed1ccf1ca2bb800292fd5b38c5c3ce37bb` is mostly GPL-2.0 with Classpath Exception, plus other parts. Closure not qualified.
- **Use:** No executable. javac hosts plugin `ErrorProne` for compile-time checks. Docs require exports/opens, `-XDcompilePolicy=simple`, `--should-stop=ifError=FLOW`, both jars on `-processorpath`, then `-Xplugin:ErrorProne`. Placeholders are not literals. Source 21; toolchain jdk 25; neither hashed.
- **Output/exits:** Javac text, not JSON/SARIF. Non-in-place writes `error-prone.patch`; IN_PLACE names the URI. No `System.exit`; status is `javacTool.run`. JDK 21 codes 0-4: ok, errors, bad args, resource, abnormal. JDK 25 follows the public `Main.compile` wrapper to internal `Result.exitCode`, also 0–4.
- **Effects:** Config: javac args; patch location required with patch checks. Network: none in fetched compiler classes; Maven/wget get jars; extra processors may use the network. Children: host javac; fetched classes start no child. Writes: none by default; IN_PLACE writes UTF-8 on the first default filesystem root; other dirs write `error-prone.patch`.
- **Limits:** Not a full jar scan. Not a redistribution approval. No signature.

Sources: https://github.com/google/error-prone/releases/tag/v2.52.0 · https://repo1.maven.org/maven2/com/google/errorprone/error_prone_core/2.52.0/error_prone_core-2.52.0-with-dependencies.jar.sha256 · https://raw.githubusercontent.com/google/error-prone/0f8c6019faf86a47b91624c22785ff5e3c5dc419/docs/installation.md

## NullAway 0.14.3

- **Artifact:** No GitHub assets. Maven `com.uber.nullaway:nullaway:0.14.3`. Published sha1 `7589b5334fe9bff66b3cf52c668f68ebf40f0573` matched the jar (635838 bytes). `.sha256` HTTP 404, so sha256 `440d3217f6a74d3b8dab766b0c63dbfbb87bea36d798879865218249dc3f1604` is local, not a publisher digest. No signature. No Main-Class; it is an Error Prone BugChecker.
- **License:** MIT. LICENSE.txt sha256 `4c337795490383b8a7f6e01eeac598bfa9f7ad86e61e6092f1d1aca859e4c29f` (matched; not the jar): https://raw.githubusercontent.com/uber/NullAway/v0.14.3/LICENSE.txt. jspecify 1.0.1 is compile scope; dataflow-nullaway 4.3.1 and guava 31.1-jre are runtime. Their closure was not cleared.
- **Use:** No executable. In-javac nullness BugChecker; it does not run project code. Unhashed JDK 17+ and Error Prone 2.36.0+. Exactly one of `AnnotatedPackages` or `OnlyNullMarked`, else `IllegalStateException`. Host sets `-Xep:NullAway` severity.
- **Output/exits:** Host text, not JSON/SARIF. Findings are nullability type errors. ErrorURL is diagnostic text, not a fetch. No `System.exit`. Default WARNING. JDK 17 codes 0-4. Config-crash code and newer JDKs unverified.
- **Effects:** Config: `-XepOpt:NullAway:*`; serialization off unless a local XML path is set (version default 4). Network: no HTTP or socket site in the jar. Children: inside javac; no child-process API. Writes: none by default; if on, appends `serialization_version.txt` and `errors.xml` fragments, or `errors.tsv` when older, plus `field_init.tsv` only if active.
- **Limits:** Dependency notices not inventoried. No signature. No jar call site is not an offline certificate for the host compiler.

Sources: https://repo1.maven.org/maven2/com/uber/nullaway/nullaway/0.14.3/nullaway-0.14.3.jar · https://raw.githubusercontent.com/uber/NullAway/v0.14.3/LICENSE.txt · https://raw.githubusercontent.com/uber/NullAway/v0.14.3/README.md

## detekt 1.23.8

- **Artifact:** Selected `detekt-cli-1.23.8-all.jar` (v1.23.8, 2025-02-21, not prerelease). API digest null. Size 69922269, computed sha256 `2ce2ff952e150baf28a29cda70a363b0340b3e81a55f43e51ec5edffc3d066c1` (local, not a publisher digest). Main-Class `io.gitlab.arturbosch.detekt.cli.Main`, DetektVersion 1.23.8, Kotlin 2.0.21. Formatting jar not selected.
- **License:** Apache-2.0. LICENSE sha256 `73441d2a64885018e2adb6e2b6dddc324c2aaa8c4e3db74e12ae220d216e17a5` (hashMatched; license text, not the jar): https://raw.githubusercontent.com/detekt/detekt/v1.23.8/LICENSE. Fat-jar notices were not inventoried. Bundling not qualified.
- **Use:** Kotlin static analysis: `java -jar detekt-cli-1.23.8-all.jar`. Input defaults to the working directory. YAML via `--config` or a classpath resource. `--report id:path` is txt, xml, html, md, or sarif. Plugin jars are extra local code.
- **Output/exits:** Console findings from loaded extensions. `--report` writes that file. sarif is SARIF 2.1.0; schema URIs are fields, not fetches. Exit: null 0, unexpected 1, max-issues 2, invalid config 3. Help exits 0 first. A handled argument violation then falls through to 1. `--max-issues` exits 0 only if the count is within the limit.
- **Effects:** Config: YAML, optionally on the default. Network: no `HttpURLConnection` in detekt classes; in-process plugins can open the network. Children: no `ProcessBuilder` there; `--parallel` is in-process. Writes: none unless `--report`; `--generate-config` writes `--config` or else `detekt.yml` (help still says `default-detekt-config.yml`); baseline writes only with `--baseline`. Default rules do not rewrite sources.
- **Limits:** Baseline path with `--baseline` omitted was not traced. Notices uninventoried. Not a redistribution approval.

Sources: https://github.com/detekt/detekt/releases/download/v1.23.8/detekt-cli-1.23.8-all.jar · https://raw.githubusercontent.com/detekt/detekt/v1.23.8/LICENSE · https://raw.githubusercontent.com/detekt/detekt/v1.23.8/README.md

## SpotBugs 4.10.5

- **Artifact:** Selected `spotbugs-4.10.5.tgz` (2026-10-12), publisher sha256 `cce3244900cc215ccd9f5a8db29ed9468fc47824faf662f4fad005343d96007e`. Zip on the same release: sha256 `f8eb9cf4ac8e1b29b3e29567541eef3f30b3bf49ff3880670a7963092cd8a859`. Bytes were not re-hashed locally. No native binary; JVM required and unhashed.
- **License:** LGPL-2.1-or-later. LICENSE sha256 `9b872a8a070b8ad329c4bd380fb1bf0000f564c75023ec8e1e6803f15364b9e9` (hashMatched; LGPL 2.1 text, not the archive): https://raw.githubusercontent.com/spotbugs/spotbugs/4.10.5/LICENSE. Headers say 2.1 or any later version. Notices not extracted. Bundling not qualified.
- **Use:** Bytecode bug finding, not a source formatter. `java -jar $SPOTBUGS_HOME/lib/spotbugs.jar -textui` plus class/jar inputs. `bin/spotbugs` and `spotbugs.bat` are wrappers, not a native analyzer. `-sarif` help says SARIF 2.1.0.
- **Output/exits:** No reporter means text. Without `-exitcode`, analysis does not call `System.exit`. With it, bits OR: bugs 1, missing classes 2, errors 4. Help and BCEL failure exit 1. `-showPlugins` exits 0. `-output` open failure exits 1; a reporter `=path` failure throws instead.
- **Effects:** Config: command line and filter files; plugins run in-process. Network: none in fetched main/runMain/printVersion; the update help string does not fetch. A plugin classloader can open the network. Children: none in fetched main; a pool only if `spotbugs.experimental.multiThread` is true. That unset default was not fetched. Writes: no report unless `-output`, `-outputFile`, or a reporter path. Training layout was not fetched.
- **Limits:** Training layout and the unset thread default are unknown. Publisher digest only. No signature.

Sources: https://api.github.com/repos/spotbugs/spotbugs/releases/tags/4.10.5 · https://raw.githubusercontent.com/spotbugs/spotbugs/4.10.5/LICENSE · https://raw.githubusercontent.com/spotbugs/spotbugs/4.10.5/docs/running.rst

## FindSecBugs 1.14.0

- **Artifact:** `findsecbugs-cli-1.14.0.zip` (tag `version-1.14.0`, 2025-06-17). Size 17209833, publisher sha256 `ff546e16e596ade5b6534a6da87881e569429bf46dfd8faed63ca63cdd69b4f8`; download matched both. Engine is SpotBugs 4.9.3, not 4.10.x, plus `findsecbugs-plugin-1.14.0.jar`. `.bat` names absent `findsecbugs-plugin-1.14.jar`.
- **License:** LGPL-3.0-or-later. LICENSE sha256 `da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768` (hashMatched; not the zip): https://raw.githubusercontent.com/find-sec-bugs/find-sec-bugs/version-1.14.0/LICENSE. Header grants 3.0 or later. Pom has no or-later SPDX field. Bundled licenses unhashed.
- **Use:** SECURITY plugin, not its own analyzer. `findsecbugs.sh` runs `java -cp lib/*.jar edu.umd.cs.findbugs.LaunchAppropriateUI -quiet -pluginList` the last `findsecbugs-plugin-*` and `-include include.xml`. A missing path is not loaded, so the `.bat` name fails. No `-textui`. Text UI if headless or args contain `-output`, `-xml`, `.class`, or `.jar`; else GUI2 with a display.
- **Output/exits:** Default text. Forwarded flags select XML, SARIF 2.1.0, HTML, emacs, or xdoc. Java status is the wrapper status. Help, bad options, no files, or BCEL failure exit 1, except `-printConfiguration` or `-version`. `-exitcode` only if forwarded (bits 1, 2, 4). Without it, a clean return is JVM termination, not a FindSecBugs code.
- **Effects:** Config: `include.xml` plus forwarded args; home `plugin/` and `~/.findbugs/plugin` also load. Network: wrappers do not fetch; classpath includes httpclient5; plugins can, so not offline-safe then. Children: one java process. Writes: none unless an output path is forwarded.
- **Limits:** Status without `System.exit` unverified. Bundled licenses unhashed. Not a redistribution certificate.

Sources: https://api.github.com/repos/find-sec-bugs/find-sec-bugs/releases/tags/version-1.14.0 · https://github.com/find-sec-bugs/find-sec-bugs/releases/download/version-1.14.0/findsecbugs-cli-1.14.0.zip · https://raw.githubusercontent.com/find-sec-bugs/find-sec-bugs/version-1.14.0/LICENSE

## Checkstyle 14.4.0

- **Artifact:** `checkstyle-14.4.0-all.jar`, publisher sha256 `c0a521e54eabd1ece4ff7bd84cf231b012615745ed3aa4fb27ab0ca73097250c` (2026-10-31). Not re-hashed locally. No signature. CLI jar, not a native binary.
- **License:** LGPL-2.1-only. LICENSE sha256 `9b872a8a070b8ad329c4bd380fb1bf0000f564c75023ec8e1e6803f15364b9e9` (license text, not the jar): https://raw.githubusercontent.com/checkstyle/checkstyle/checkstyle-14.4.0/LICENSE. README says GNU LGPL v2.1. `LICENSE.apache20` sha256 `aac73b3148f6d1d7111dbca32099f68d26c644c6813ae1e4f05f6579aa2663fe` covers bundled ANTLR, Commons, Guava, and Picocli, not the project license.
- **Use:** Java source audit, not a formatter. `java -jar checkstyle-14.4.0-all.jar -c <config.xml> <files>`. `-c` is a filesystem path or classpath resource. `-f` is plain, xml, or sarif (default plain). `-o` writes the report; default is stdout.
- **Output/exits:** Plain violations by default. `Main` exits `min(status, 255)`. A finished audit uses the error count, capped so a multiple of 256 cannot become 0. Invalid input is -1; `CheckstyleException` is -2. `min` does not raise those, so -1 or -2 reaches `exit`.
- **Effects:** Config: required XML `-c`; optional `-p`. A `-D` style is not a picocli option. Network: no client in tagged `Main.java`; `-c` is not a URL. Children: JVM only; default threads 1; no spawn in `Main.java`. Writes: `-o` creates or overwrites the report; `-g`/`-G` write suppression XML to that same output.
- **Limits:** Publisher digest only. Bundled Apache-2.0 files do not change the project license. No signature. Not a redistribution approval.

Sources: https://github.com/checkstyle/checkstyle/releases/tag/checkstyle-14.4.0 · https://github.com/checkstyle/checkstyle/blob/checkstyle-14.4.0/src/main/java/com/puppycrawl/tools/checkstyle/Main.java · https://raw.githubusercontent.com/checkstyle/checkstyle/checkstyle-14.4.0/LICENSE
