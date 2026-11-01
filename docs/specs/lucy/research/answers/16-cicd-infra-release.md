# 16-cicd-infra-release

session ses_12a8cc09f4259888579a21d3aaef17718fb6bf508397d8575e1f434f26ffed36

## Answer

**Conclusion.** Reviewing CI/CD, build, infra and release means reviewing the trust boundaries around code that runs with privileges. In a workflow, ask four things: who can trigger it, what code it runs, which token and secrets it holds, and which caches or artifacts it trusts. In a release, ask whether the bytes users receive are authenticated end to end, including the auto-update path. This repo is already well hardened: no pull_request_target or workflow_run anywhere, top-level `permissions: contents: read`, mostly SHA-pinned actions, and a nonce-bound positive control against vacuous green runs. Two real gaps stand out:
- Windows auto-update signature verification is turned off (`verifyUpdateCodeSignature: false`).
- The omni artifact workflow, which the desktop release calls, uses third-party actions pinned only by tag.

**Reviewer checklist (primary sources)**

1. **GitHub Actions**
   - **Triggers:**
     - Flag pull_request_target or workflow_run combined with a checkout of PR code.
     - Treat artifacts from untrusted runs as untrusted.
     - A label gate is only a stopgap: there is a race between labeling and the run.
   - **Script injection:** flag `${{ github.event.* }}` (title, body, head_ref, commit message, author email) inside `run:`. The fix is an `env:` intermediate.
   - **Tokens:** default to `contents: read` and raise per job. Use `persist-credentials: false`. Prefer OIDC over long-lived secrets.
   - **Pinning:** use a lockfile or a full commit SHA. Tags are mutable.
   - **Self-hosted runners:** almost never on public repos.
   - **Cache poisoning:** cache contents are not signed. Only trusted triggers should write caches, and caches must hold no secrets.
   - **Scanners:** zizmor (MIT) and actionlint (MIT). CodeQL and OpenSSF Scorecard also cover these patterns.
2. **Build and packaging**
   - Reproducible means same source, environment and instructions give bit-for-bit identical artifacts, verified by hash.
   - SLSA L1/L2/L3 means provenance exists / provenance is signed on a hosted platform / the build is hardened.
   - Electron: check that fuses are flipped before signing.
   - Containers: watch for secrets left in layers. A Docker `ENV` value persists in its layer even after `unset`.
3. **Release**
   - macOS: code signing plus notarization. Squirrel.Mac only updates a signed app.
   - Windows: Authenticode, via an EV certificate or Azure Artifact Signing.
   - electron-builder `verifyUpdateCodeSignature` (default true) pins the publisher DN in `app-update.yml`. Setting it to false makes electron-updater install updates without verifying their signature.
4. **IaC and containers**
   - Pin base images by digest. Use multi-stage builds, a non-root `USER`, and `set -o pipefail` in `RUN`.
   - Scanners: Checkov (Apache-2.0), Trivy (Apache-2.0; tfsec is being consolidated into Trivy), KICS (Apache-2.0), Hadolint (GPL-3.0; fine as a CLI, matters only if you redistribute it).
   - Engines: OpenTofu is MPL-2.0.
5. **CI as evidence (this repo)**
   - Full CI runs only when the `epic` label is added or a run is dispatched by hand (test.yml and typecheck.yml trigger on `pull_request: labeled`).
   - Change-scoped runs go through `bun run test:ci`. A merge-queue `packages` input narrows a lane.
   - The omni positive control prints exactly one nonce-tagged verdict per run, and test-ci.ts accepts only that line. This defeats vacuous greens and output spoofing by tests.
   - The release refuses to publish unless the version is X.Y.Z and the ref is dev, and refuses existing tags or releases.

**Supporting claims**
- **read**, `.github/workflows/*.yml`: a regex search for pull_request_target|workflow_run|self-hosted returned no trigger hits (coverage complete, 27 files). Every hit was a `permissions:` line or a tag-pinned `uses:`.
- **read**, `.github/workflows/typecheck.yml:17-18` and `release-desktop.yml:31-32`: `permissions: contents: read`. test.yml:30-32 adds `checks: write`. Actions are SHA-pinned (`actions/checkout@34e1148…` at typecheck.yml:27).
- **read**, `.github/workflows/omni-artifacts.yml:89,97,101,113`: `Swatinem/rust-cache@v2`, `mlugg/setup-zig@v2`, `taiki-e/install-action@v2`, `actions/upload-artifact@v4` are tag-pinned. `release-desktop.yml:65` calls this workflow, so release binaries are built with mutable third-party refs.
- **read**, `apps/desktop/electron-builder.config.ts:246`: `verifyUpdateCodeSignature: false` on the Windows config. Prod publishes a generic feed (`:314-317`) that `apps/desktop/src/main/updater.ts:16-24` consumes. Windows NSIS updates are therefore not publisher-verified on the client. The `latest.yml` hash protects integrity against the feed, not authenticity of the feed (inferred).
- **read**, `electron-builder.config.ts:136-141`: fuses `runAsNode`, `nodeOptions` and `nodeCliInspect` are off and `onlyLoadAppFromAsar` is on. Embedded asar integrity stays off by a recorded decision (`:135`). Per the Electron docs, `onlyLoadAppFromAsar` only guarantees validated code when combined with asar integrity.
- **read**, `script/test-omni-control.ts:18-21`: a nonce-tagged verdict line, with the nonce removed from env before tests load.
- **read**, `.github/workflows/release-desktop.yml:52-56`: version, ref and existing-tag guards.
- **read**: repo search found `.github/dependabot.yml`, but no zizmor, actionlint, hadolint, checkov, trivy, SOURCE_DATE_EPOCH or build-provenance attestation in `.github`, `script` or `nix`.
- **inferred**: the release header makes `sign=false` publishable. Unsigned macOS builds then only announce updates, and Windows shows SmartScreen. The repo does not show a staged-rollout knob (such as `stagingPercentage`) or a rollback path beyond `allowDowngrade = false`.

**Not examined:** staged-rollout and rollback docs for electron-updater (the electron.build page failed to fetch), Kubernetes and Pod Security guidance, flaky-test literature, Dockerfiles or IaC in this repo, the bodies of each workflow's `run:` steps (so script injection in this repo is unverified), and repo settings (environments, required reviewers, CODEOWNERS).

**Reproduce:** search `.github/workflows` for `pull_request_target|workflow_run|uses: [^ ]+@v[0-9]`, and `apps/desktop/electron-builder.config.ts` for `verifyUpdateCodeSignature`.

## Claims

[
 {
  "proposition": "No workflow uses pull_request_target, workflow_run or self-hosted runners; every workflow declares a permissions block.",
  "nature": "observation",
  "scope": "universal",
  "subquestion": {
   "id": "rque_2255eb220f63f90f63d6518132",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3bc5776496bd76e69c1cfc3698",
      "revision": 1
     },
     "representation": "text",
     "digest": "b7e6777f63bf861b1fdf72e5ddb646bd236f252f5189b71484bb28f1d2d4ab85"
    },
    "quote": "coverage: files=27 ignoreRespected=true binariesSkipped=0 complete=true"
   }
  ]
 },
 {
  "proposition": "omni-artifacts.yml uses tag-pinned third-party actions and is called by release-desktop.yml.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_2255eb220f63f90f63d6518132",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f3c9139b84d672563542044798",
      "revision": 1
     },
     "representation": "text",
     "digest": "1d08ba9c79906d3eaed77a57e0613b2c495b3d3344b49c1ea7531fa71f87fb4a"
    },
    "lines": {
     "start": 87,
     "end": 103
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_7aec852fc92b7a1221689fe069",
      "revision": 1
     },
     "representation": "text",
     "digest": "a2d212fc241c63aaf63037628608055040c53158125ee3cf6ba229e164840690"
    },
    "quote": ".github/workflows/release-desktop.yml:65:     uses: ./.github/workflows/omni-artifacts.yml"
   }
  ]
 },
 {
  "proposition": "typecheck.yml and test.yml run only on the epic label or dispatch, with contents: read and SHA-pinned actions.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4f640e66a13288f2228769633a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ff609b6776020fedaddad520c0",
      "revision": 1
     },
     "representation": "text",
     "digest": "2e97e1a98e811d9acce064c54d5c277409ddb9d1d27e217487c2ebd4d44a8ad4"
    },
    "lines": {
     "start": 5,
     "end": 27
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_4b0b0f55e45e1565039ac2d6f4",
      "revision": 1
     },
     "representation": "text",
     "digest": "7078de19c63d3d65ff8011f94867565df1d2cb008981b2025e0d84ed43d5568a"
    },
    "lines": {
     "start": 5,
     "end": 32
    }
   }
  ]
 },
 {
  "proposition": "The omni positive control prints one nonce-tagged verdict per run and removes the nonce from env before tests load, so test:ci rejects vacuous or spoofed greens.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4f640e66a13288f2228769633a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f26998081a01f3e25ebde0b04b",
      "revision": 1
     },
     "representation": "text",
     "digest": "dbe322a69a5f3978cc9fd763f22822f5706d47f37fca97617e86e6e224030848"
    },
    "lines": {
     "start": 1,
     "end": 21
    }
   }
  ]
 },
 {
  "proposition": "release-desktop.yml publishes only stable X.Y.Z from dev, refuses existing releases/tags, and has contents: read.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_4f640e66a13288f2228769633a",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b0cd47bad6cafad0b864ddbe04",
      "revision": 1
     },
     "representation": "text",
     "digest": "80c4ccf0fbe6c552eb45509c4c165f125e4248a9cb172801899787fa444264b5"
    },
    "lines": {
     "start": 1,
     "end": 57
    }
   }
  ]
 },
 {
  "proposition": "The desktop config disables Windows update code-signature verification, flips hardening fuses with asar integrity off, and notarizes macOS; the updater disallows downgrade and prerelease.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_44b7d8680d191c93764e5f8ca4",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c8c5eeef1bef5cd89ac7bfe093",
      "revision": 1
     },
     "representation": "text",
     "digest": "198c89d31fa8ff61a039fe313debb48cfb9fbe511d4e152252d339241dc5c639"
    },
    "quote": "verifyUpdateCodeSignature: false,"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_c8c5eeef1bef5cd89ac7bfe093",
      "revision": 1
     },
     "representation": "text",
     "digest": "198c89d31fa8ff61a039fe313debb48cfb9fbe511d4e152252d339241dc5c639"
    },
    "quote": "// Embedded asar integrity stays off: it needs per-platform signing order that cannot be checked without a release."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_18fdb0dac6bbe0b7cc67c1330f",
      "revision": 1
     },
     "representation": "text",
     "digest": "0d0339c0f3a4473c805d6d7042a5e4cc1e73d63cb7c5905bccb164d164f1921f"
    },
    "lines": {
     "start": 16,
     "end": 24
    }
   }
  ]
 },
 {
  "proposition": "electron-builder documents that verifyUpdateCodeSignature=false makes electron-updater install updates without verifying their signature; default true pins the publisher DN.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_44b7d8680d191c93764e5f8ca4",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_02950c46762cff426f13ceab16",
      "revision": 1
     },
     "representation": "text",
     "digest": "0606cb432f1c6076f5f1798fbeb8e92abe332544127488566080f2ad189116eb"
    },
    "quote": "which tells electron-updater\n   * to install updates without verifying their signature. This is the only opt-out."
   }
  ]
 },
 {
  "proposition": "Electron docs: macOS needs signing plus notarization and Squirrel.Mac requires a signed app; Windows needs EV or Azure Artifact Signing; onlyLoadAppFromAsar only guarantees validated code together with embeddedAsarIntegrityValidation.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_44b7d8680d191c93764e5f8ca4",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_17e82c9bf896b23f1cc14cf84d",
      "revision": 1
     },
     "representation": "text",
     "digest": "77c70ce6af90aaa8fef6a20228455b46f9f3f96396be968c419735b657991974"
    },
    "quote": "autoUpdater - Squirrel.Mac requires the app to be\nsigned for automatic updates to work at all."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_0067535d158e8c1a71c6461739",
      "revision": 1
     },
     "representation": "text",
     "digest": "653f401eb7f88e0e98cecbd38c0cb30f7f39cdef7cf97a1d4cd66b71e96a0889"
    },
    "quote": "When combined with the embeddedAsarIntegrityValidation fuse, this fuse ensures that\nit is impossible to load non-validated code."
   }
  ]
 },
 {
  "proposition": "GitHub docs: pull_request_target/workflow_run with untrusted checkout can take over a repo; use env intermediates against script injection; least-privilege GITHUB_TOKEN; pin to full SHA (tags are mutable); self-hosted runners almost never for public repos.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0f1b14feb635601d2a86319381",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d1f34fc7c26c4c1da10621c74b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "46385e58650cb066ced1c31c4cfeed1ff97776d9992255fe938d48176b3ba8c1"
    },
    "quote": "These vulnerabilities can be exploited to take over a repository."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d1f34fc7c26c4c1da10621c74b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "46385e58650cb066ced1c31c4cfeed1ff97776d9992255fe938d48176b3ba8c1"
    },
    "quote": "because a tag can be moved or deleted if a bad actor gains access to the repository storing the action."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d1f34fc7c26c4c1da10621c74b",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "46385e58650cb066ced1c31c4cfeed1ff97776d9992255fe938d48176b3ba8c1"
    },
    "quote": "self-hosted runners should almost [never be used for public repositories]"
   }
  ]
 },
 {
  "proposition": "Security Lab: combining pull_request_target with checkout of an untrusted PR is dangerous; label gates are racy; artifacts from untrusted PRs are untrusted; head_ref, titles, bodies, commit messages and emails are attacker-controlled injection sources.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0f1b14feb635601d2a86319381",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_c0fbf3b9692b3438460d9a943f",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "238657a4ff6a5a26846ff4ce5ede97992db625b24aefbedd5bc8fe9e92d34cf9"
    },
    "quote": "Artifacts resulting from untrusted PR data are themselves untrusted and should be treated as such when handled in privileged contexts."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_72be427fb20717aa8d37162cdd",
      "revision": 1
     },
     "representation": "text",
     "digest": "5cc84a8518df08bedc414e9b579886f5957372084cafcae923f48f9c5c9af3bf"
    },
    "quote": "The best practice to avoid code and command injection vulnerabilities in GitHub workflows is to set the untrusted input value of the expression to an intermediate environment variable"
   }
  ]
 },
 {
  "proposition": "GitHub cache docs: cache contents are not signed or verified; only trusted triggers write default-branch caches; do not store secrets in caches.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0f1b14feb635601d2a86319381",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f129ce2d122dbf5182b7409099",
      "revision": 1
     },
     "representation": "text",
     "digest": "180ad8afb708b0e9599db043694d567bdf28d995c1e8ac2b7ebdbbd17ac9d3bb"
    },
    "quote": "Cache contents are not signed or verified, and any workflow run that can read a cache may extract its contents."
   }
  ]
 },
 {
  "proposition": "zizmor and actionlint are MIT licensed.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0f1b14feb635601d2a86319381",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6c870f84ce5048d3f89ca33f44",
      "revision": 1
     },
     "representation": "text",
     "digest": "4676e0e205c260f1baff336f97fbdb0b52f93a716ec2e866a370be54a1f7f86b"
    },
    "quote": "`zizmor` is licensed under the [MIT License](./LICENSE)."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a3c36283d9ece632269804ed5b",
      "revision": 1
     },
     "representation": "text",
     "digest": "03a26b06d224380a02bf100e05fff3b2dfc71b14d4e2fa685ec9963a87563c22"
    },
    "quote": "the MIT License"
   }
  ]
 },
 {
  "proposition": "A reproducible build yields bit-by-bit identical artifacts from the same source, environment and instructions; SLSA Build L1/L2/L3 require provenance, signed provenance from a hosted platform, and a hardened platform.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_9909ce5a607debb291325e0678",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d85df902e3f1ed1f3ef977aa7c",
      "revision": 1
     },
     "representation": "text",
     "digest": "b38349babfbca0b538834bfeefce95c964ec7bebfa6063812258602d6458bae8"
    },
    "quote": "A build is reproducible if given the same source code, build environment\nand build instructions, any party can recreate bit-by-bit identical copies of\nall specified artifacts."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f966e97f2a57bd5791a87e6528",
      "revision": 1
     },
     "representation": "text",
     "digest": "2fd2373432c148e1f4572404435e5a0de31838816f2903a426e2996fd19b4513"
    },
    "quote": "Signed provenance, generated by a hosted build platform"
   }
  ]
 },
 {
  "proposition": "Docker best practices: pin base images by digest, use multi-stage builds, run as non-root USER, use pipefail; ENV values persist in layers.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_67d898f7caecc713ba44439f2d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f0e987e9bb0a3a81bb860141fd",
      "revision": 1
     },
     "representation": "text",
     "digest": "0122531d38a0666a6443fb06cee433422391f3cb01449bd5a1b027a1b2b64100"
    },
    "quote": "To fully secure your supply chain integrity, you can pin the image version to a\nspecific digest."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f0e987e9bb0a3a81bb860141fd",
      "revision": 1
     },
     "representation": "text",
     "digest": "0122531d38a0666a6443fb06cee433422391f3cb01449bd5a1b027a1b2b64100"
    },
    "quote": "If a service can run without privileges, use `USER` to change to a non-root\nuser."
   }
  ]
 },
 {
  "proposition": "Licenses: Checkov, Trivy and KICS are Apache-2.0; Hadolint is GPL-3.0; OpenTofu is MPL-2.0; tfsec is being consolidated into Trivy.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_67d898f7caecc713ba44439f2d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b25009ef84a5674d971d55d578",
      "revision": 1
     },
     "representation": "text",
     "digest": "9e4d2c48d14f34bcd0ec705853140345940093b47048b69857fa53fe4221f676"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_422cdfbfca9942d94a02f02e2d",
      "revision": 1
     },
     "representation": "text",
     "digest": "70239d9fe281bb61dc87191100a7aba0dd9f06979a08bdf3866a70d3ad6f3ee0"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a673ca76a245c75d49a3567afb",
      "revision": 1
     },
     "representation": "text",
     "digest": "17f51493a7a0fda5e8eadbda9104cb33ca65027e8758831351508f1b602a0b6b"
    },
    "quote": "\"spdx_id\": \"Apache-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_48c91daebc83de276d5c95894c",
      "revision": 1
     },
     "representation": "text",
     "digest": "fe55d44bcdbae336d0903c70f0849e0c68c5ba17585114473c157035947a7dba"
    },
    "quote": "\"spdx_id\": \"GPL-3.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_b34dd7d3f9f12e7393525f07c3",
      "revision": 1
     },
     "representation": "text",
     "digest": "e36fe7ae7b45e1f07dfae4e143b132376b6f056d1654b4ba8582699ea644f9c5"
    },
    "quote": "\"spdx_id\": \"MPL-2.0\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_de620b83e368f4c63ea1d651a7",
      "revision": 1
     },
     "representation": "text",
     "digest": "fb6a206cba558c311c09acf678f300662187f15f6459c088b06940133355555a"
    },
    "quote": "## 📣 tfsec to Trivy Migration"
   }
  ]
 }
]
