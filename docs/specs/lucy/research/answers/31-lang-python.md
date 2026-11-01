# 31-lang-python

session ses_068f69130173f0b15eebeb744034862e15ffcabebec2c11bb1bb08cbade00221

## Answer

**Conclusion.** The question assumes lucy can run Python tools, but it can't. Today lucy is the `review` profile: read, glob, grep and `maestro_record_review`, with no bash, `skills: []` and no MCP. So every tool below needs a new, deliberately read-only way to run, not just a prompt change. The best fit has three tiers:
- **(a) Fast first pass, run through Orchestra's sandboxed process layer (omni) in a throwaway copy:** ruff, pyright/mypy (ty as an early option, still beta), bandit, pip-audit or osv-scanner against the lockfile, and diff-cover over coverage.xml.
- **(b) Deep audit, on request only:** pylint, Semgrep CE with your own or permissively licensed rules, Pysa, griffe, mutmut, Hypothesis and atheris.
- **(c) A shipped `lucy-*` seat skill** holding the expert checklist and the rules for reading tool output.

Two licenses rule out embedding: the CodeQL CLI and the Semgrep-maintained rules can't be bundled or run for users inside a commercial product. Run them only when the user already has them installed and licensed.

**Supporting claims**
- read: lucy's profile is `review` (no bash, no edit) and its `skills` list is empty: modules/maestro/coordination/src/roster.ts:49-56, modules/maestro/coordination/src/seats/lucy.ts:11-13.
- read: Ruff has 900+ rules in Rust, with caching and native re-implementations of flake8 plugins (bugbear and others).
- read: ty is MIT-licensed and includes a language server, but it is beta (0.0.x), so its diagnostics may change between versions. pytype stops at Python 3.12, so drop it.
- read: pylint is GPLv2 (run the installed copy, never bundle it). It also ships symilar, a duplicate-code finder.
- read: Bandit is Apache-licensed.
- read: Semgrep CE engine is LGPL-2.1. Semgrep-maintained rules are barred from competing vendor products. Semgrep's hosted MCP at semgrep.dev/docs/mcp only searches documentation; it does not scan code.
- read: CodeQL CLI terms allow analysis of OSI-licensed codebases only, and forbid integrating it into other software or services, unless the user has GitHub Advanced Security.
- read: pip-audit is Apache-2.0, outputs JSON and CycloneDX, and has `--locked`. Its security model says "If you wouldn't pip install it, you should not pip audit it", so audit lockfiles, never resolve untrusted input.
- read: OSV-Scanner has call analysis that cuts false positives, plus an offline mode.
- read: `uv run --frozen`/`--no-sync` skip relocking and syncing. PyPI supports PEP 740 attestations from Trusted Publishers.
- read: diff-cover (Apache-2.0) limits coverage and quality reports to the diff and outputs JSON.
- read: mutmut needs `fork` and writes a `mutants/` directory, so it must run in a copy. Griffe finds API-breaking changes.
- read: Pysa treats every attribute of a tainted object as tainted, which causes known false positives.
- read: Django's `check --deploy` adds deployment-only checks. Atheris on macOS needs its own LLVM build, because Apple Clang lacks libFuzzer.
- inferred: Detect the toolchain by reading `uv.lock`, `poetry.lock`, `pylock.toml`, `requirements*.txt` and `pyproject` `[tool.*]` tables; reuse the repo's own config; run tools pinned with `uvx`. When a toolchain is missing, report the gap rather than installing into the repo.
- inferred: The expert checklist no tool catches covers mutable default arguments, late-binding closures, broad `except` that swallows errors, timezone-naive datetimes, blocking calls inside `async` (FastAPI), `Depends` scoping, Django N+1 queries, raw SQL via `extra()`/`RawSQL`, `pickle`/`yaml.load`/`torch.load` on untrusted data, pandas chained assignment and dtype coercion, notebooks with hidden state or committed outputs and secrets, and ML data leakage between train and test sets.

**Not examined, because of time:** mypy, deptry, vulture, radon/xenon, import-linter, cosmic-ray, coverage.py and secret-scanner licenses; laptop timings; published precision numbers (one study's figures were seen only in a search snippet and could not be confirmed against the source); and community MCP servers.

**Reproduce the profile claim:** `rg -n 'review:' -A7 modules/maestro/coordination/src/roster.ts`

## Claims

[
 {
  "proposition": "lucy uses the review profile: read/glob/grep/maestro_record_review only, no bash or edit, so it cannot run any CLI tool today.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4ed3581f6f4124f611d9636ff4",
      "revision": 1
     },
     "representation": "text",
     "digest": "068ec6b02922a92800c99739c7c0be035280a25353a988aed747a4b836952cb3"
    },
    "quote": "maestro_record_review: \"allow\""
   }
  ],
  "subquestion": {
   "id": "rque_822d8c37287c6e2b5cd9c7f927",
   "revision": 1
  }
 },
 {
  "proposition": "lucy's seat definition declares profile review, says it cannot edit or run commands, and has no skills.",
  "nature": "observation",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0ecfb468bf280554bf06bc0cc9",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 11,
     "end": 13
    }
   }
  ],
  "subquestion": {
   "id": "rque_822d8c37287c6e2b5cd9c7f927",
   "revision": 1
  }
 },
 {
  "proposition": "Ruff is a Rust linter with 900+ rules, caching and native flake8-bugbear reimplementations.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_38e938b87097ef859dee2460e8",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f9d033a3a7064b0e8eaeadc20494c3425b5299ee0e5d0a8b5dd286f4df032e4e"
    },
    "quote": "Over [900 built-in rules](rules/), with native re-implementations of popular Flake8 plugins, like flake8-bugbear"
   }
  ],
  "subquestion": {
   "id": "rque_20cd171e5e9178dddec064ce85",
   "revision": 1
  }
 },
 {
  "proposition": "ty is MIT licensed, beta with 0.0.x versioning, and includes a language server.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_59b78f5fc91b4c1221e82e5575",
      "revision": 1
     },
     "representation": "text",
     "digest": "8da93511cec1298648c345618960559c7dec67504b9132c1b9aee9a841e9fe08"
    },
    "quote": "ty is licensed under the MIT license"
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "pytype's last supported Python version is 3.12, so it should be dropped.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_679535805f616a39b80a8e8206",
      "revision": 1
     },
     "representation": "text",
     "digest": "ba0efc10d3d64044810911fb6e8868da32201adb55e81a4516cbbc6a5cde8d36"
    },
    "quote": "The last supported Python version for Pytype will be 3.12."
   }
  ],
  "subquestion": {
   "id": "rque_20cd171e5e9178dddec064ce85",
   "revision": 1
  }
 },
 {
  "proposition": "Pylint is GPLv2 (invoke, do not bundle) and ships symilar for duplicate code.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6f17279124b1d206776cb9e39f",
      "revision": 1
     },
     "representation": "text",
     "digest": "0555955f72d9c851adb68e29707c08bea0ad124b4a3189c138253c5785531b37"
    },
    "quote": "symilar_  (duplicate code finder that is also integrated in pylint)"
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "Bandit is Apache licensed.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f2051125465e10b9694358fdea",
      "revision": 1
     },
     "representation": "text",
     "digest": "3d02c42afb961f75cbd68268a2a44cfb968c9c937ed94962ee652ab6c3cf0426"
    },
    "quote": "* Free software: Apache license"
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "Semgrep CE engine is LGPL 2.1 but Semgrep-maintained rules are barred from competing vendor products.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bb7a4c442a808e6e05a7776a62",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "c3a007cc3535ea63ea8c9e2f6abb8b4d2e8440ca90a151b3cb50934637cb95c8"
    },
    "quote": "Vendors cannot use Semgrep-maintained rules in competing products or SaaS offerings."
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "Semgrep's hosted MCP at semgrep.dev/docs/mcp is a documentation-search server, not a code scanner.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f7a497f04f166226731999c300",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "4aaf245f6b6c6e80a93f88e28e26a2881cea13422815bcda67b2486def44214d"
    },
    "quote": "This Model Context Protocol server provides search and retrieval tools for the Semgrep site."
   }
  ],
  "subquestion": {
   "id": "rque_988946be0e2df9774f6f0f546d",
   "revision": 1
  }
 },
 {
  "proposition": "CodeQL CLI terms restrict use to OSI-licensed codebases and forbid integration into other software or services, absent GitHub Advanced Security.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c4163e8c1225e42301161342e0",
      "revision": 1
     },
     "representation": "text",
     "digest": "f4637e78a23b768634fad409599e72c81e288286fb0de0a086abe709583beb26"
    },
    "lines": {
     "start": 44,
     "end": 52
    }
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "pip-audit is Apache-2.0 and warns that auditing an input is equivalent to installing it.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d94f721703307d81325fcaa36d",
      "revision": 1
     },
     "representation": "text",
     "digest": "e89d1d37b646ad6234c365e978f19a282319f245746cfbdd5bd6aafd04735cc2"
    },
    "quote": "`pip-audit` is licensed under the Apache 2.0 License."
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "OSV-Scanner supports call analysis to reduce false positives.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_13a4c8034b481974457079991e",
      "revision": 1
     },
     "representation": "text",
     "digest": "ae9d6a52e41fea4dad413bf20ef6097cba581891e139e918484c38cad8fcb751"
    },
    "quote": "OSV-Scanner has the option of using call analysis to determine if a vulnerable function is actually being used in the project, resulting in fewer false positives, and actionable alerts."
   }
  ],
  "subquestion": {
   "id": "rque_20cd171e5e9178dddec064ce85",
   "revision": 1
  }
 },
 {
  "proposition": "uv run --frozen uses the lockfile without updating it.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3fc2589e745177919eb54a9a28",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f40c33d81b233d9f0b37c29cf9923bc90514c65bb6741d44631dd42dae9ac04d"
    },
    "quote": "To use the lockfile without checking if it is up-to-date, use the `--frozen` option:"
   }
  ],
  "subquestion": {
   "id": "rque_de59af1de93eea8be921034e6d",
   "revision": 1
  }
 },
 {
  "proposition": "PyPI accepts PEP 740 attestations signed by Trusted Publisher identities.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_da01b306f72882239c0349703e",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "fca1609b4db66a5c13b10b905019d101b8b6a8151f304860ef0f372902ccd354"
    },
    "quote": "Currently, PyPI allows for attestations to be signed by the following Trusted Publisher identities:"
   }
  ],
  "subquestion": {
   "id": "rque_20cd171e5e9178dddec064ce85",
   "revision": 1
  }
 },
 {
  "proposition": "diff-cover is Apache-2.0 and scopes coverage to the git diff with JSON output.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3e6964d67683ac331c246d696a",
      "revision": 1
     },
     "representation": "text",
     "digest": "ade832d3c135c4be5f9622472087eb3563465f1a500e14e3685c91fd95334b83"
    },
    "quote": "The code in this repository is licensed under the Apache 2.0 license."
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "mutmut requires fork support and writes a mutants/ directory, so it must run on a copy.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_9575da9a78fc733dd688b43831",
      "revision": 1
     },
     "representation": "text",
     "digest": "412dd489c3534c649f9a4d5a815e709d43a5a80bbc9b57dc572533c4ed0dbe9d"
    },
    "quote": "Mutmut must be run on a system with `fork` support."
   }
  ],
  "subquestion": {
   "id": "rque_de59af1de93eea8be921034e6d",
   "revision": 1
  }
 },
 {
  "proposition": "Griffe's check command detects API breaking changes.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4d45e387c98b630e0a60117196",
      "revision": 1
     },
     "representation": "text",
     "digest": "0bd88518fe9b24e3655e2b98f8764bba313dad4680a997a76061afce264874f3"
    },
    "quote": "### Check for API breaking changes"
   }
  ],
  "subquestion": {
   "id": "rque_20cd171e5e9178dddec064ce85",
   "revision": 1
  }
 },
 {
  "proposition": "Pysa over-taints object attributes, a documented false-positive source.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fb155bb7fa5863b23378253dc5",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "5064ce1f8bd46644356c7887f8e0017a666105b4de728897906c65935140188f"
    },
    "quote": "When an object is tainted, that means that all attributes of that object are also tainted. Note that this is another source of potential false positives"
   }
  ],
  "subquestion": {
   "id": "rque_63817412ce7caac8704e0f1ee8",
   "revision": 1
  }
 },
 {
  "proposition": "Atheris on macOS needs LLVM built from source because Apple Clang lacks libFuzzer.",
  "nature": "extraction",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3fb5f28afe08d951022c969133",
      "revision": 1
     },
     "representation": "text",
     "digest": "23570dd1a7e0de9cc6423c184323f88781e6e92994edbc5b5998e09bc5dbcb14"
    },
    "quote": "Apple Clang doesn't come with libFuzzer"
   }
  ],
  "subquestion": {
   "id": "rque_20cd171e5e9178dddec064ce85",
   "revision": 1
  }
 },
 {
  "proposition": "Integration and checklist recommendations: detect the toolchain from lockfiles and pyproject, run pinned tools read-only in a copy through the sandboxed process layer, ship the expert checklist as a lucy seat skill, and treat the listed Python footguns as human-review items.",
  "nature": "inference",
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0ecfb468bf280554bf06bc0cc9",
      "revision": 1
     },
     "representation": "text",
     "digest": "061f813eee88736ec5683c8d25a06727ac82c2cffb7b1661a53b21d8d48c5c4f"
    },
    "lines": {
     "start": 11,
     "end": 13
    }
   }
  ],
  "subquestion": {
   "id": "rque_c72e03e6ce341eabd8ec1dc405",
   "revision": 1
  }
 }
]
