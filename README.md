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
- 本地开发需要 Bun。Release 中的二进制文件已经包含 Bun 运行时。

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

交互模式：

```bash
bun run start
```

查看仓库列表：

```bash
bun run list
```

克隆缺失仓库：

```bash
bun run clone
```

拉取已存在仓库：

```bash
bun run pull
```

输出 JSON：

```bash
bun run list -- --json
```

克隆时顺便拉取本地已存在仓库：

```bash
bun run clone -- --update
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

## 发布 Release

Release assets 通常通过 CI 流水线生成，最常见的是 GitHub Actions。流程一般是：推送 tag 后触发 workflow，安装依赖，编译跨平台文件，创建 GitHub Release，并把编译后的文件上传到 assets。

本仓库已加入 `.github/workflows/release.yml`。发布方式：

```bash
git tag v0.1.0
git push origin v0.1.0
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
