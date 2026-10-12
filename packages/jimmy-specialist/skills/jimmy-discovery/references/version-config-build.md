# Version, configuration, build and loaded bytes

Read when environments disagree, documentation applicability is uncertain, or resolution/generation affects selected behavior. A repository revision is not necessarily the deployed artifact identity.

## Trace the identity chain

Keep these states separate: declared dependency/config, resolved lock, available installation, generated output, built artifact, deployed artifact and observed loaded module/provider. For each necessary step, retain the actual source/manifest/receipt and its conditions. Missing links remain missing; do not extrapolate from a path or timestamp.

Read package aliases, workspace overrides, patched dependencies and forks before choosing upstream documentation. Use the applicable version's official source/contract and delta notes when behavior differs. A `latest` page is a candidate, not proof for an older or modified install.

## Configuration and resolution

Find precedence across defaults, project/user files, environment, command inputs and host policy. Differentiate configured value, interpreted effective value and observed runtime value. Protect secrets: ask for redacted relevant facts through permitted acquisition, never circumvent a secret/path denial.

For Node package resolution, inspect `exports`, ordered conditional branches, `import`/`require`, active custom conditions and package type. Node's conditional-exports documentation is version-specific; `NODE_ENV=production` does not itself activate every `production` export condition. Bun, a bundler and desktop Node can select different paths; read their effective resolver/configuration rather than transferring Node's rule blindly.

TypeScript paths can affect typechecking without defining runtime resolution. An alias declaration, `.d.ts` or clean typecheck does not prove the loaded body. Read [identity](identity.md) for the caller-to-body chain.

## Generation and packaging

Trace authoritative schema/input, generator version/options, output naming, bundler conditions, copied assets and runtime loader. Source content existing in the checkout does not prove embedding in compiled Bun or desktop Node artifacts. An import edge to generated output does not demonstrate generation was executed or its bytes are current.

If the question concerns a packaged skill or context source, retain the effective loaded revision/bytes, not merely its declared name. Project/global overrides must not be silently treated as the packaged entry. A hash supplied by the host establishes content identity under its representation; do not invent a hash or equate it with correctness.

## History and divergence

Use exposed fixed history queries to compare relevant revisions and recorded rationale. Do not run shell or rebuild/install/deploy to investigate. Compare the smallest meaningful difference: the selected export, effective setting, generated contract or loaded artifact. Source changes and rollout/config changes are competing causes until observations discriminate them.

When loaded identity or deploy/config facts are unavailable, return the predicted selection from static sources and exact missing evidence. Propose a qualified executor observation for the loaded module/build and effective setting, with the matching working control. Preserve holds verbatim and conclude with bounded applicability, not “same lockfile, therefore same runtime”.
