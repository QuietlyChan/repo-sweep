# Repo Sweep

语言：**简体中文** | [English](README.en.md) | [日本語](README.ja.md) | [Français](README.fr.md)

Repo Sweep 用于批量操作当前账号可访问的 GitLab 或 GitHub 仓库，支持一键列表、克隆和拉取。CLI 提供交互式终端 UI、并发 Git 任务、真实 Git 进度输出，并可编译成跨平台单文件可执行程序。

## 功能

- 支持 GitLab 和 GitHub。
- 使用 `@clack/prompts` 提供交互式选择。
- 支持批量 `list`、`clone`、`pull`。
- 支持并发克隆/拉取，并显示“当前序号/总数”。
- 解析 Git 真实进度并显示条状进度。
- HTTPS Token 认证通过临时 `GIT_ASKPASS` 完成，不会把 Token 拼进克隆地址。
- 使用 `bun build --compile` 构建单文件二进制，可执行文件包含 Bun 运行时。

## 运行要求

- 系统需要安装 Git，并且 `git` 命令在 `PATH` 中可用。
- 当前网络需要能访问配置的平台地址。
- npm 安装方式需要 Node.js 20 或更高版本。
- 本地开发和构建 Release 二进制需要 Bun。Release 中的二进制文件已经包含 Bun 运行时。

## npm 安装

npm 上的包名是 `@quietlychan/repo-sweep`，安装后的命令仍然是 `repo-sweep`。

临时执行：

```bash
npx @quietlychan/repo-sweep --help
```

全局安装：

```bash
npm install -g @quietlychan/repo-sweep
repo-sweep --help
```

如果不想安装 Node.js，可以从 GitHub Release 下载对应平台的单文件二进制。

## 配置

复制配置模板：

```bash
cp .env.example .env
```

GitLab 示例：

```env
GIT_PROVIDER=gitlab
GIT_BASE_URL=http://127.0.0.1/
GIT_API_URL=http://127.0.0.1/api/v4/
GIT_TOKEN=个人访问令牌
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=oauth2
```

GitHub 示例：

```env
GIT_PROVIDER=github
GIT_BASE_URL=https://github.com/
GIT_API_URL=https://api.github.com/
GIT_TOKEN=个人访问令牌
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=x-access-token
```

## 使用

下面示例假设已经通过 npm 全局安装，或正在使用 GitHub Release 下载的二进制文件。临时使用 `npx` 时，把 `repo-sweep` 替换为 `npx @quietlychan/repo-sweep`。

交互模式：

```bash
repo-sweep
```

查看仓库列表：

```bash
repo-sweep list
```

克隆缺失仓库：

```bash
repo-sweep clone
```

拉取已存在仓库：

```bash
repo-sweep pull
```

输出 JSON：

```bash
repo-sweep list --json
```

克隆时顺便拉取本地已存在仓库：

```bash
repo-sweep clone --update
```

进度输出示例：

```text
[克隆:进度] 07/80 group/project [############----------]  55% 接收对象（已完成 42/80）
```

## 命令参数

- `--provider gitlab|github`：选择平台，默认 `gitlab`。
- `--base-url <url>`：平台地址。
- `--api-url <url>`：API 地址。不传时会按平台地址推导。
- `--token <token>`：个人访问令牌，推荐使用 `GIT_TOKEN`。
- `--dir <path>`：本地目标目录。
- `--clone-url http|ssh`：克隆地址类型，默认 `http`。
- `--git-username <name>`：HTTPS Git 用户名。GitLab 默认 `oauth2`，GitHub 默认 `x-access-token`。
- `--concurrency <n>`：并发 Git 任务数，默认 `4`。
- `--progress-interval <sec>`：长时间 Git 任务的心跳日志间隔，设为 `0` 可关闭。
- `--skip-archived`：跳过已归档仓库。
- `--dry-run`：只打印计划执行的 Git 命令，不真正执行。
- `--flat`：不保留 group/subgroup，只按项目名放到根目录。名称重复时可能冲突。
- `--json`：`list` 命令输出 JSON。
- `--show-token`：交互模式中显示完整 Token。

## 构建可执行文件

构建所有配置的平台：

```bash
bun run build:bin
```

只构建当前平台：

```bash
bun run build:bin:current
```

构建指定 Bun target：

```bash
bun run build:bin -- --target bun-linux-x64
```

默认输出：

```text
dist/repo-sweep-darwin-arm64
dist/repo-sweep-darwin-x64
dist/repo-sweep-linux-x64
dist/repo-sweep-linux-arm64
dist/repo-sweep-windows-x64.exe
dist/README.txt
```

## 发布 npm 包

`repo-sweep` 这个 npm 名称已经被占用，所以 npm 包使用 scoped 名称：

```text
@quietlychan/repo-sweep
```

发布前先确认 npm 登录状态：

```bash
npm whoami
```

如果未登录：

```bash
npm login
```

发布公开 scoped 包：

```bash
npm publish --access public
```

发布前 `prepack` 会自动执行 `bun run build:npm`，生成 Node.js 可运行的 `dist-npm/repo-sweep.js`。发布后可这样验证：

```bash
npx @quietlychan/repo-sweep --help
```

如果启用了 npm 双因素认证，发布时需要输入一次性验证码。后续也可以配置 npm Trusted Publishing，让 GitHub Actions 通过 OIDC 发布，不需要长期 npm token。

## 发布 Release

Release assets 通常通过 CI 流水线生成，最常见的是 GitHub Actions。流程一般是：推送 tag 后触发 workflow，安装依赖，编译跨平台文件，创建 GitHub Release，并把编译后的文件上传到 assets。

本仓库已加入 `.github/workflows/release.yml`。发布方式：

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions 会自动：

1. 安装 Bun。
2. 安装依赖。
3. 执行 TypeScript 检查。
4. 构建 `dist` 中的跨平台二进制文件。
5. 把 `dist` 里的文件上传到 GitHub Release assets。

workflow 使用 GitHub 内置的 `GITHUB_TOKEN`，普通公开仓库上传 Release assets 不需要额外配置 Token。需要确认仓库 Actions 权限允许 `contents: write`。

## 开发

安装依赖：

```bash
bun install
```

类型检查：

```bash
bun run typecheck
```

本地运行 CLI：

```bash
bun run start
```

## 开源协议

MIT 协议。查看 [LICENSE](LICENSE)。
