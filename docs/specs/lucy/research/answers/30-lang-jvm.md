# 30-lang-jvm

session ses_6ea2d25e7c481a8ebb87217e6e5631bde193f5ad51fcb057331645c532807e93

## Answer

**Conclusion.** Mistaken premise: today `lucy` can't run any of these tools. It is a read-only review seat with no skills, no toolkit and no MCP grants. The seat framework also lets only `backend` use the pinned toolkit (claims 1–2). So "native integration" means new seat work, not configuration. The fit I recommend has four parts:
- **Seat skill:** a shipped `lucy-jvm-review` skill holds the checklist and run recipes.
- **CLI runs:** compiler-plugin and bytecode tools (Error Prone + NullAway, SpotBugs + FindSecBugs, PMD/CPD, detekt, japicmp, OWASP Dependency-Check) run through omni into a scratch directory, never by editing the repo's build. They are invoked from the user's cache, not bundled, because several are LGPL/GPL.
- **MCP:** only where it already exists (the IntelliJ built-in server, the japicmp MCP server).
- **LSP:** kotlin-lsp is too early to depend on (claims 3–12).

**Supporting claims**
1. read: `modules/maestro/coordination/src/seats/lucy.ts:12-17`. The description says "Read-only: reads and searches files; cannot edit or run commands", with `skills: []`, `toolkit: false` and no `mcp` grants. The prompt (`prompt/lucy.txt:1`) covers correctness, regressions, security and missing tests, and names no tools.
2. read: `seat.ts`. `define()` throws "The backend toolkit supports only the backend seat". `seat.ts:37-40` defines `toolkit` (the shell fetches pinned engines) and `mcp` (configured MCP servers a seat may call). Giving lucy tools therefore means changing the framework rule, or adding an `mcp` grant plus a run-capable profile. That is an owner/archie decision.
3. read: licenses.
   - Error Prone: Apache-2.0 (COPYING).
   - NullAway: MIT.
   - PMD: BSD-style.
   - Checkstyle: LGPL-2.1.
   - SpotBugs and FindSecBugs: LGPL.
   - Infer: MIT, but Java support may need GPL components.
   - Checker Framework: GPL2 with classpath exception; only `checker-qual`/`checker-util` are MIT.
   - OWASP Dependency-Check: Apache-2.0.
   - OpenRewrite: core and the Maven/Gradle plugins are Apache-2.0. Many recipes are under the Moderne Source Available License, which forbids putting them "into commercial products or be re-sold".
   
   inferred: invoke the LGPL/GPL tools as separately downloaded processes rather than embedding them in the app. Don't ship Moderne-licensed recipes.
4. read: Error Prone runs at compile time. NullAway is an Error Prone plugin with build overhead "usually less than 10%". It needs JDK 17+ and Error Prone 2.36.0+, plus `AnnotatedPackages` or `OnlyNullMarked`. Gradle Error Prone plugin 3.x dropped Android support. Lombok is not recommended. Guava's JSpecify `@NullMarked` "may lead to some false positives". The maintainers claim it catches most production NPEs they saw. That is a vendor claim, not an independent precision study.
5. read: detekt emits SARIF, HTML, Markdown and Checkstyle XML, and supports baselines. It wraps ktlint as a rule set. 1.23.8 is the stable release; 2.0 is alpha.
6. read: PMD has 400+ rules and bundles CPD for duplication, including Kotlin. It runs from a CLI (`bin/pmd check`) or Docker.
7. read: OWASP Dependency-Check is an SCA tool that matches dependencies to CPE/CVE identifiers. It needs Java 11+ and internet access. Without an NVD API key, updates are "extremely slow". The OSS Index analyzer turns itself off without Sonatype credentials. That makes it a slow, network-bound deep-audit tool, not a first pass.
8. read: Gradle dependency verification is turned on when `gradle/verification-metadata.xml` exists. It checks checksums and PGP signatures of artifacts, POMs and plugins, but not SNAPSHOTs. The docs say it protects against compromised dependencies, not vulnerable ones. `--dependency-verification lenient` reports failures without failing the build. inferred: whether this file exists, and is in strict mode, is a cheap supply-chain signal.
9. read: japicmp compares two jars for binary and source compatibility, with a `--semantic-versioning` verdict. It does about 1700 classes in under a second. It outputs Markdown/XML/HTML (no SARIF) and has an MCP server (`siom79/japicmp-mcp-server`).
10. read: IntelliJ IDEA has shipped a built-in MCP server since 2025.2 for external clients such as Claude Code.
11. read: kotlin-lsp is official JetBrains but Alpha and "partially closed-source". Its Android Gradle Plugin support is experimental and it has no KMP support yet.
12. inferred, not sourced in this run (verify before relying on it):
   - **Toolchain detection:** detect the build system from `gradlew`/`settings.gradle(.kts)`/`pom.xml`/`mvnw`, and the JDK from `.java-version`, `.sdkmanrc`, `.tool-versions` or the Gradle toolchain block.
   - **Running without touching build files:** Gradle `--init-script` from a temp directory, or a Maven `groupId:artifactId:version:goal` CLI call.
   - **Missing JDK:** report `check-unavailable`; don't install anything.
   - **Rest of the tool map:** JaCoCo (EPL-2.0), PIT (Apache-2.0, with an incremental mode), ArchUnit, jqwik, Jazzer (Apache-2.0), jcstress (GPL2+CPE), Lincheck, revapi, CycloneDX, Android Lint, Gitleaks for secrets.
   - **Signal per minute:** for a first pass, `-Xlint:all` + Error Prone + detekt; for a deep audit, add SpotBugs/FindSecBugs, PIT on the diff, Dependency-Check and japicmp.
   - **Checklist items no tool catches:** `equals`/`hashCode`/`compareTo` contracts, `@Transactional` self-invocation and proxy bypass in Spring, coroutine `runBlocking`/`GlobalScope` and cancellation swallowing, `!!` and platform types at the Java boundary, double-checked locking and `ThreadLocal` leaks in pools, deserialization sinks, Android lifecycle and context leaks, `double` for money, and `Optional` misuse.

**Not examined:** precision papers. The Google CACM "effective false positive" paper and Infer's CACM paper both failed to fetch, so false-positive rates are uncited. Also not examined: SonarQube's MCP server, CodeQL licensing, the CycloneDX, PIT, Jazzer and Android Lint docs, and Maven toolchain detection. Gradle init-script behavior was not probed. Reading the CACM PDF and running one Gradle init-script probe would settle claim 12.

**Reproduce:** no probe ran. All claims come from read sources.

## Claims

[
 {
  "proposition": "lucy is a read-only review seat that cannot edit or run commands, with no skills, no toolkit and no MCP grants.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_9caf72271baa5c7af080100283",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_005c445f9499cee8111087c96b",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 12,
     "end": 17
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6b07e1fdc193dfbfe567094c92",
      "revision": 1
     },
     "representation": "text",
     "digest": "32a93ebeb62fcc2a17d9bac3c4306ba5604c78b193ee29630b622488b58e98e5"
    },
    "lines": {
     "start": 1,
     "end": 1
    }
   }
  ]
 },
 {
  "proposition": "The seat framework restricts the pinned toolkit to the backend seat; MCP access is a per-seat grant of configured servers.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_9caf72271baa5c7af080100283",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_053f282248f2848c86cfbd10e5",
      "revision": 1
     },
     "representation": "text",
     "digest": "c1b6da1b74e93fe24407da25c30f53d862d9a3059d95284c7e32fec5653fad96"
    },
    "lines": {
     "start": 37,
     "end": 40
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4a1c3ccfa12084ce8a2d434f9d",
      "revision": 1
     },
     "representation": "text",
     "digest": "3c32ac0288eeef353d0b5d0315567426f805ec9820375b1976e9f2b71b61235b"
    },
    "quote": "The backend toolkit supports only the backend seat"
   }
  ]
 },
 {
  "proposition": "Error Prone is Apache-2.0, NullAway MIT, PMD BSD-style, Checkstyle LGPL-2.1, SpotBugs and FindSecBugs LGPL, Infer MIT with GPL components for Java, Checker Framework mostly GPL2 with classpath exception (checker-qual MIT), Dependency-Check Apache-2.0.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_4cb7d2b55530b3f3e8460608f9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a7c4e07add601a388dc303a7bc",
      "revision": 1
     },
     "representation": "text",
     "digest": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
    },
    "lines": {
     "start": 2,
     "end": 3
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3221bc6fbc74b7f7ce81306533",
      "revision": 1
     },
     "representation": "text",
     "digest": "546be757debfcdae5e78b2ddbebcd9197f4452da4b34c36e948c675427ac1783"
    },
    "quote": "NullAway is licensed under the MIT license."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_319111d01df31bd97272d028ac",
      "revision": 1
     },
     "representation": "text",
     "digest": "897a1819d5f70081ef254c3266dfa05bd3e63746117fd6bbcd0a46ecdd808268"
    },
    "quote": "[BSD Style](LICENSE)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b8aa8dbbea79300f6c3839e564",
      "revision": 1
     },
     "representation": "text",
     "digest": "a11987c82cb96f5e59936105ec23d69ead8d0e9e05fcdd96840ffb33be82849a"
    },
    "quote": "Checkstyle is licensed under the [GNU LGPL v2.1 License](LICENSE)."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_2cc6cfe87ab731785abbd59891",
      "revision": 1
     },
     "representation": "text",
     "digest": "5419ac1f4ff947c6b44ed015fb48048d966457f3a89f6ee8e09e2018737c5581"
    },
    "quote": "SpotBugs is licensed under the [GNU LESSER GENERAL PUBLIC LICENSE]"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_efff52110990ef96d9b4481130",
      "revision": 1
     },
     "representation": "text",
     "digest": "093bb70c5e5cfd29d9e08f43db1ec350ff9d03a8e91e6022cdd7fe0a14c597c2"
    },
    "quote": "This software is release under [LGPL]"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_de548d18c19476d8450d867863",
      "revision": 1
     },
     "representation": "text",
     "digest": "88f4662885cecefba8426e5ae784966c7d689fd7ee7b31e33aa3025990dc960b"
    },
    "quote": "Infer is MIT-licensed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_584881a2dac729b6657e500c54",
      "revision": 1
     },
     "representation": "text",
     "digest": "887fd0008912d990d9bc442d1c03b7d1e55c84d1792fdf4cb1d97552d768523e"
    },
    "quote": "Most of the Checker Framework is licensed under the GNU General Public"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0c338cf3360204695f668c952e",
      "revision": 1
     },
     "representation": "text",
     "digest": "ef47eb9a1bf6600a2274dfea6ea5b31cca599f9ba259a09a9ca8abb18df1ae9d"
    },
    "quote": "Permission to modify and redistribute is granted under the terms of the Apache 2.0 license."
   }
  ]
 },
 {
  "proposition": "OpenRewrite core and its Maven/Gradle plugins are Apache-2.0, but Moderne Source Available recipes cannot be put into commercial products or resold.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_4cb7d2b55530b3f3e8460608f9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4116a1869dcc105eb60d174509",
      "revision": 1
     },
     "representation": "text",
     "digest": "7c4533c271890cd9712072c50a8b2d842a2ab1ef90f0e829e2bbb8c057d40fa5"
    },
    "quote": "the recipes cannot be put into commercial products or be re-sold"
   }
  ]
 },
 {
  "proposition": "detekt emits SARIF, HTML, Markdown and Checkstyle XML, supports baselines, and wraps ktlint as a rule set.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_4cb7d2b55530b3f3e8460608f9",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d20d55d3d20a3313e5efca0bb5",
      "revision": 1
     },
     "representation": "text",
     "digest": "a5c42da6315220d96717908970f3fb6f461cae70ae095d887685ffdb4c77a091"
    },
    "quote": "Support for different report formats: HTML, Markdown, [SARIF](https://sarifweb.azurewebsites.net/), XML (Checkstyle) and custom reports."
   }
  ]
 },
 {
  "proposition": "NullAway's maintainers report build overhead usually under 10%, while noting false positives with Guava's JSpecify annotations.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_69f9bca4a46ce5ae3bf8cb4b5b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3221bc6fbc74b7f7ce81306533",
      "revision": 1
     },
     "representation": "text",
     "digest": "546be757debfcdae5e78b2ddbebcd9197f4452da4b34c36e948c675427ac1783"
    },
    "quote": "In our measurements, the build-time overhead of running NullAway is usually less than 10%."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3221bc6fbc74b7f7ce81306533",
      "revision": 1
     },
     "representation": "text",
     "digest": "546be757debfcdae5e78b2ddbebcd9197f4452da4b34c36e948c675427ac1783"
    },
    "quote": "This treatment may lead to some false positives (due to handling of type variables)"
   }
  ]
 },
 {
  "proposition": "Gradle dependency verification is activated by gradle/verification-metadata.xml, does not detect vulnerable dependencies, and has a lenient CLI mode.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e335044bc9cae6850e3714d349",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_08016cfc77b5cb6f36c8879846",
      "revision": 1
     },
     "representation": "text",
     "digest": "9f385c180f820ee6f6b15f3e8bb8ddbbc24b86597cc7184603bd7450cc6ca6e6"
    },
    "quote": "Dependency verification is automatically enabled as soon as the verification metadata file is detected."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_08016cfc77b5cb6f36c8879846",
      "revision": 1
     },
     "representation": "text",
     "digest": "9f385c180f820ee6f6b15f3e8bb8ddbbc24b86597cc7184603bd7450cc6ca6e6"
    },
    "quote": "not to prevent you from including *vulnerable* dependencies"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_08016cfc77b5cb6f36c8879846",
      "revision": 1
     },
     "representation": "text",
     "digest": "9f385c180f820ee6f6b15f3e8bb8ddbbc24b86597cc7184603bd7450cc6ca6e6"
    },
    "lines": {
     "start": 299,
     "end": 299
    }
   }
  ]
 },
 {
  "proposition": "OWASP Dependency-Check is extremely slow to update without an NVD API key, and the OSS Index analyzer disables itself without credentials.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_e335044bc9cae6850e3714d349",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0c338cf3360204695f668c952e",
      "revision": 1
     },
     "representation": "text",
     "digest": "ef47eb9a1bf6600a2274dfea6ea5b31cca599f9ba259a09a9ca8abb18df1ae9d"
    },
    "quote": "Without an NVD API Key dependency-check's updates will be **extremely slow**."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0c338cf3360204695f668c952e",
      "revision": 1
     },
     "representation": "text",
     "digest": "ef47eb9a1bf6600a2274dfea6ea5b31cca599f9ba259a09a9ca8abb18df1ae9d"
    },
    "quote": "Without credentials, Dependency Check will **automatically disable the OSS Index analyzer**."
   }
  ]
 },
 {
  "proposition": "japicmp compares two jars for binary/source compatibility, is fast, and has an MCP server for AI agents.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_b4996187c4bb663bee3b44d206",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_08e34eed3e3cf38063714fa80f",
      "revision": 1
     },
     "representation": "text",
     "digest": "7220f681b40cd694206b6d914c9de5599b2d2fa518eb2f8cd8c2b741bdaf41e5"
    },
    "quote": "exposes japicmp's API comparison capabilities"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_08e34eed3e3cf38063714fa80f",
      "revision": 1
     },
     "representation": "text",
     "digest": "7220f681b40cd694206b6d914c9de5599b2d2fa518eb2f8cd8c2b741bdaf41e5"
    },
    "quote": "in less than one second and therewith can be easily integrated in each build"
   }
  ]
 },
 {
  "proposition": "IntelliJ IDEA ships an integrated MCP server since 2025.2; kotlin-lsp is official but Alpha and partially closed-source.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_b4996187c4bb663bee3b44d206",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c2849304def7d558553185a03d",
      "revision": 1
     },
     "representation": "text",
     "digest": "2336da497e28a1cf4fd8316929a0d37756e908c39e860e3d8d033b9be68babb0"
    },
    "lines": {
     "start": 3,
     "end": 3
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0824a22f505fb6323c415e0d90",
      "revision": 1
     },
     "representation": "text",
     "digest": "73c217a77f494a393e5aad875a0005e2008f08f0775272e8de9860942ad53c79"
    },
    "quote": "making it partially closed-source"
   }
  ]
 },
 {
  "proposition": "A reviewer can run tools without editing the repository via build CLI flags (e.g. Gradle --dependency-verification) and standalone CLIs (PMD, japicmp) on sources and build outputs; Gradle-vs-Maven and JDK detection from wrapper/toolchain files is inferred, not probed in this run.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_c98ad33e1c47aa18ff5d282402",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_08016cfc77b5cb6f36c8879846",
      "revision": 1
     },
     "representation": "text",
     "digest": "9f385c180f820ee6f6b15f3e8bb8ddbbc24b86597cc7184603bd7450cc6ca6e6"
    },
    "lines": {
     "start": 299,
     "end": 299
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_319111d01df31bd97272d028ac",
      "revision": 1
     },
     "representation": "text",
     "digest": "897a1819d5f70081ef254c3266dfa05bd3e63746117fd6bbcd0a46ecdd808268"
    },
    "quote": "Execute `bin/pmd check`"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_08e34eed3e3cf38063714fa80f",
      "revision": 1
     },
     "representation": "text",
     "digest": "7220f681b40cd694206b6d914c9de5599b2d2fa518eb2f8cd8c2b741bdaf41e5"
    },
    "quote": "java -jar japicmp-0.26.5-jar-with-dependencies.jar -n new-version.jar -o old-version.jar"
   }
  ]
 }
]
