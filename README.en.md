# Repo Sweep

Languages: [简体中文](README.md) | **English** | [日本語](README.ja.md) | [Français](README.fr.md)

Repo Sweep batch lists, clones, and pulls repositories that the current account can access on GitLab or GitHub. The CLI supports an interactive terminal UI, concurrent Git tasks, real Git progress output, and compiled cross-platform binaries.

## Features

- GitLab and GitHub provider support.
- Interactive prompts powered by `@clack/prompts`.
- Batch `list`, `clone`, and `pull`.
- Concurrent clone/pull jobs with `current/total` progress.
- Git progress parsing with text progress bars.
- HTTPS token authentication through temporary `GIT_ASKPASS`; tokens are not written into clone URLs.
- Single-file binaries built with `bun build --compile`.

## Requirements

- Git must be installed and available in `PATH`.
- Network access to the configured Git provider.
- The npm package requires Node.js 20 or newer.
- Bun is required for local development and Release binary builds. Release binaries include the Bun runtime.

## npm Installation

The npm package name is `@quietlychan/repo-sweep`; the installed command is still `repo-sweep`.

Run without installing globally:

```bash
npx @quietlychan/repo-sweep --help
```

Install globally:

```bash
npm install -g @quietlychan/repo-sweep
repo-sweep --help
```

If Node.js is not available, download the single-file binary for the current platform from GitHub Releases.

## Configuration

Copy the example file:

```bash
cp .env.example .env
```

GitLab example:

```env
GIT_PROVIDER=gitlab
GIT_BASE_URL=http://127.0.0.1/
GIT_API_URL=http://127.0.0.1/api/v4/
GIT_TOKEN=personal_access_token
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=oauth2
```

GitHub example:

```env
GIT_PROVIDER=github
GIT_BASE_URL=https://github.com/
GIT_API_URL=https://api.github.com/
GIT_TOKEN=personal_access_token
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=x-access-token
```

## Usage

The examples below assume a global npm install or a GitHub Release binary. For temporary `npx` usage, replace `repo-sweep` with `npx @quietlychan/repo-sweep`.

Interactive mode:

```bash
repo-sweep
```

List repositories:

```bash
repo-sweep list
```

Clone missing repositories:

```bash
repo-sweep clone
```

Pull existing repositories:

```bash
repo-sweep pull
```

Output JSON:

```bash
repo-sweep list --json
```

Clone and also pull repositories that already exist locally:

```bash
repo-sweep clone --update
```

Example progress output:

```text
[clone:progress] 07/80 group/project [############----------]  55% receiving objects (completed 42/80)
```

The actual CLI output is localized in Chinese.

## CLI Options

- `--provider gitlab|github`: Select the provider. Default: `gitlab`.
- `--base-url <url>`: Provider web URL.
- `--api-url <url>`: Provider API URL. If omitted, it is inferred from `--base-url`.
- `--token <token>`: Personal access token. Prefer `GIT_TOKEN`.
- `--dir <path>`: Local target directory.
- `--clone-url http|ssh`: Clone URL type. Default: `http`.
- `--git-username <name>`: HTTPS Git username. GitLab defaults to `oauth2`; GitHub defaults to `x-access-token`.
- `--concurrency <n>`: Number of concurrent Git jobs. Default: `4`.
- `--progress-interval <sec>`: Heartbeat interval for long-running Git jobs. Use `0` to disable.
- `--skip-archived`: Skip archived repositories.
- `--dry-run`: Print planned Git commands without executing them.
- `--flat`: Store repositories directly under the target directory by project name. This can collide when names repeat.
- `--json`: Print JSON for `list`.
- `--show-token`: Show the full token in interactive mode.

## Build Binaries

Build all configured targets:

```bash
bun run build:bin
```

Build only the current platform:

```bash
bun run build:bin:current
```

Build a specific Bun target:

```bash
bun run build:bin -- --target bun-linux-x64
```

Default outputs:

```text
dist/repo-sweep-darwin-arm64
dist/repo-sweep-darwin-x64
dist/repo-sweep-linux-x64
dist/repo-sweep-linux-arm64
dist/repo-sweep-windows-x64.exe
dist/README.txt
```

## Publish to npm

The unscoped `repo-sweep` name is already taken on npm, so this package uses the scoped name:

```text
@quietlychan/repo-sweep
```

Check npm login status:

```bash
npm whoami
```

Log in if needed:

```bash
npm login
```

Publish the public scoped package:

```bash
npm publish --access public
```

The `prepack` script runs `bun run build:npm` before publishing and generates the Node.js runtime package at `dist-npm/repo-sweep.js`. Verify after publishing:

```bash
npx @quietlychan/repo-sweep --help
```

If npm two-factor authentication is enabled, npm will ask for a one-time password. Trusted Publishing can also be configured later so GitHub Actions publishes through OIDC without a long-lived npm token.

## Releases

Yes, repositories like the one in the screenshot usually use a CI workflow such as GitHub Actions. The workflow builds binaries on tag pushes, creates a GitHub Release, and uploads the compiled files as Release assets.

This repository includes `.github/workflows/release.yml`. To publish a release:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions will:

1. Install Bun.
2. Install dependencies.
3. Run the TypeScript check.
4. Build cross-platform binaries into `dist`.
5. Upload the files in `dist` to the GitHub Release assets.

The workflow uses the built-in `GITHUB_TOKEN`, so no extra token is needed for public release uploads in normal GitHub repositories. Make sure repository Actions permissions allow `contents: write`.

## Development

Install dependencies:

```bash
bun install
```

Run type checking:

```bash
bun run typecheck
```

Run the CLI locally:

```bash
bun run start
```

## License

MIT License. See [LICENSE](LICENSE).
