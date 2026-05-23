# Changelog

## v0.1.0

Repo Sweep 的首个公开版本，提供 GitLab/GitHub 多仓库批量管理能力，并带有跨平台 Release 二进制产物。

### 新增

- 支持 GitLab 和 GitHub Provider 架构。
- 支持批量查看、克隆和拉取当前账号可访问的仓库。
- 支持交互式命令行，使用方向键选择平台、操作和配置项。
- 支持并发 clone/pull，并显示当前序号、总数和 Git 原始进度条。
- 支持 HTTPS Token 认证，通过临时 `GIT_ASKPASS` 注入凭据，不把 Token 写进 clone URL。
- 支持 `http` 和 `ssh` 两种 clone URL。
- 支持跳过已归档仓库、dry-run、JSON 输出、扁平目录等常用参数。
- 支持 Git 未安装、网络不可达、API 请求失败等中文错误提示。
- 提供中文默认 README，以及英文、日语、法语 README。
- 使用 MIT 协议开源。

### Release 产物

- `repo-sweep-darwin-arm64`：macOS Apple 芯片。
- `repo-sweep-darwin-x64`：macOS Intel 芯片。
- `repo-sweep-linux-x64`：Linux x64。
- `repo-sweep-linux-arm64`：Linux arm64。
- `repo-sweep-windows-x64.exe`：Windows x64。
- `SHA256SUMS.txt`：所有 Release 产物的 SHA-256 校验值。

### 使用示例

```bash
repo-sweep clone
repo-sweep pull
repo-sweep list --json
```

### 完整变更

https://github.com/QuietlyChan/repo-sweep/commits/v0.1.0
