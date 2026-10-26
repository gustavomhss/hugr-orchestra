# Contributing to Orchestra

We want to make it easy for you to contribute to Orchestra. Here are the most common type of changes that get merged:

- Bug fixes
- Additional LSPs / Formatters
- Improvements to LLM performance
- Support for new providers
- Fixes for environment-specific quirks
- Missing standard behavior
- Documentation improvements

However, any UI or core product feature must go through a design review with the core team before implementation.

If you are unsure if a PR would be accepted, feel free to ask a maintainer or look for issues with any of the following labels:

- [`help wanted`](https://github.com/gustavomhss/hugr-orchestra/issues?q=is%3Aissue%20state%3Aopen%20label%3Ahelp-wanted)
- [`good first issue`](https://github.com/gustavomhss/hugr-orchestra/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22)
- [`bug`](https://github.com/gustavomhss/hugr-orchestra/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug)
- [`perf`](https://github.com/gustavomhss/hugr-orchestra/issues?q=is%3Aopen%20is%3Aissue%20label%3A%22perf%22)

> [!NOTE]
> PRs that ignore these guardrails will likely be closed.

Want to take on an issue? Leave a comment and a maintainer may assign it to you unless it is something we are already working on. Bugs and questions go to [GitHub Issues](https://github.com/gustavomhss/hugr-orchestra/issues).

## Adding New Providers

New providers shouldn't require many if ANY code changes, but if you want to add support for a new provider first make a PR to:
https://models.dev

## Developing Orchestra

- Requirements: Bun 1.3+
- Install dependencies and start the dev server from the repo root:

  ```bash
  bun install
  bun dev
  ```

### Running against a different directory

By default, `bun dev` runs Orchestra in the `apps/cli` directory. To run it against a different directory or repository:

```bash
bun dev <directory>
```

To run Orchestra in the root of the orchestra repo itself:

```bash
bun dev .
```

### Building a "localcode"

To compile a standalone executable:

```bash
./apps/cli/script/build.ts --single
```

Then run it with:

```bash
./apps/cli/dist/cli-<platform>/bin/orchestra
```

Replace `<platform>` with your platform (e.g., `darwin-arm64`, `linux-x64`).

- Core pieces:
  - `apps/cli`: The Orchestra executable, daemon and command handlers.
  - `packages/core`: Orchestra core business logic.
  - `packages/tui`: The TUI code, written in SolidJS with [opentui](https://github.com/sst/opentui)
  - `packages/app-shell`: The shared web UI components, written in SolidJS
  - `apps/web`: The browser bootstrap and development server
  - `apps/desktop`: The native desktop app, built with Electron (wraps `packages/app-shell`)
  - `packages/plugin`: Source for `@orchestra/plugin`

### Understanding bun dev vs orchestra

During development, `bun dev` is the local equivalent of the built `orchestra` command. Both run the same CLI interface:

```bash
# Development (from project root)
bun dev --help           # Show all available commands
bun dev serve            # Start headless API server
bun dev web              # Start server + open web interface
bun dev <directory>      # Start TUI in specific directory

# Production
orchestra --help          # Show all available commands
orchestra serve           # Start headless API server
orchestra web             # Start server + open web interface
orchestra <directory>     # Start TUI in specific directory
```

### Running the API Server

To start the Orchestra headless API server:

```bash
bun dev serve
```

This starts the headless server on port 4096 by default. You can specify a different port:

```bash
bun dev serve --port 8080
```

### Running the Web App

To test UI changes during development:

1. **First, start the Orchestra server** (see [Running the API Server](#running-the-api-server) section above)
2. **Then run the web app:**

```bash
bun run dev:web
```

This starts a local dev server at http://localhost:3000 (the port is set in `apps/web/vite.config.ts`). Most UI changes can be tested here, but the server must be running for full functionality.

### Running the Desktop App

The desktop app is an Electron application that wraps the web UI.

To run the desktop app in development:

```bash
bun run --cwd apps/desktop dev
```

To create a production build and package the app:

```bash
bun run --cwd apps/desktop build
bun run --cwd apps/desktop package
```

> [!NOTE]
> After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`; do not edit `src/generated` or `src/generated-effect` by hand. [AGENTS.md](./AGENTS.md) is the reference for the command, and CI runs `check:generated`, so a stale generated file fails the build.

> [!NOTE]
> The repository ships no enforced commit hooks: `.husky` only holds what `husky` installs, so nothing runs on commit. Run the checks yourself before pushing.

Please try to follow the [style guide](./AGENTS.md)

### Setting up a Debugger

Bun debugging is currently rough around the edges. We hope this guide helps you get set up and avoid some pain points.

The most reliable way to debug Orchestra is to run it manually in a terminal via `bun run --inspect=<url> dev ...` and attach
your debugger via that URL. Other methods can result in breakpoints being mapped incorrectly, at least in VSCode (YMMV).

Caveats:

- If you want to run the Orchestra TUI and have breakpoints triggered in the server code, you might need to run `bun dev spawn` instead of
  the usual `bun dev`. This is because `bun dev` runs the server in a worker thread and breakpoints might not work there.
- If `spawn` does not work for you, you can debug the server separately:
  - Debug server: `bun run --inspect=ws://localhost:6499/ --cwd apps/cli ./src/index.ts serve --port 4096`,
    then attach TUI with `orchestra attach http://localhost:4096`
  - Debug TUI: `bun run --inspect=ws://localhost:6499/ --cwd apps/cli ./src/index.ts`

Other tips and tricks:

- You might want to use `--inspect-wait` or `--inspect-brk` instead of `--inspect`, depending on your workflow
- Specifying `--inspect=ws://localhost:6499/` on every invocation can be tiresome, you may want to `export BUN_OPTIONS=--inspect=ws://localhost:6499/` instead

#### VSCode Setup

If you use VSCode, you can use our example configurations [.vscode/settings.example.json](.vscode/settings.example.json) and [.vscode/launch.example.json](.vscode/launch.example.json).

Some debug methods that can be problematic:

- Debug configurations with `"request": "launch"` can have breakpoints incorrectly mapped and thus unusable
- The same problem arises when running Orchestra in the VSCode `JavaScript Debug Terminal`

With that said, you may want to try these methods, as they might work for you.

## Pull Request Expectations

### General Requirements

- Keep pull requests small and focused
- Explain the issue and why your change fixes it
- Before adding new functionality, ensure it doesn't already exist elsewhere in the codebase

### UI Changes

If your PR includes UI changes, please include screenshots or videos showing the before and after. This helps maintainers review faster and gives you quicker feedback.

### Logic Changes

For non-UI changes (bug fixes, new features, refactors), explain **how you verified it works**:

- What did you test?
- How can a reviewer reproduce/confirm the fix?

### No AI-Generated Walls of Text

Long, AI-generated PR descriptions and issues are not acceptable and may be ignored. Respect the maintainers' time:

- Write short, focused descriptions
- Explain what changed and why in your own words
- If you can't explain it briefly, your PR might be too large

### PR Titles

PR titles should follow conventional commit standards:

- `feat:` new feature or functionality
- `fix:` bug fix
- `docs:` documentation or README changes
- `chore:` maintenance tasks, dependency updates, etc.
- `refactor:` code refactoring without changing behavior
- `test:` adding or updating tests

You can optionally include a scope to indicate which package is affected:

- `feat(app):` feature in the app package
- `fix(desktop):` bug fix in the desktop package
- `chore(orchestra):` maintenance in the orchestra package

Examples:

- `docs: update contributing guidelines`
- `fix: resolve crash on startup`
- `feat: add dark mode support`
- `feat(app): add dark mode support`
- `fix(desktop): resolve crash on startup`
- `chore: bump dependency versions`

### Style Preferences

These are not strictly enforced, they are just general guidelines:

- **Functions:** Keep logic within a single function unless breaking it out adds clear reuse or composition benefits.
- **Destructuring:** Do not do unnecessary destructuring of variables.
- **Control flow:** Avoid `else` statements.
- **Error handling:** Prefer `.catch(...)` instead of `try`/`catch` when possible.
- **Types:** Reach for precise types and avoid `any`.
- **Variables:** Stick to immutable patterns and avoid `let`.
- **Naming:** Choose concise single-word identifiers when they remain descriptive.
- **Runtime APIs:** Use Bun helpers such as `Bun.file()` when they fit the use case.

## Feature Requests

For net-new functionality, start with a design conversation. Describe the problem, your proposed approach (optional), and why it belongs in Orchestra, in an issue or by asking a maintainer. The core team will help decide whether it should move forward; please wait for that approval instead of opening a feature PR directly.
