# Repo Sweep

言語：[简体中文](README.md) | [English](README.en.md) | **日本語** | [Français](README.fr.md)

Repo Sweep は、現在のアカウントがアクセスできる GitLab または GitHub リポジトリを一括で一覧表示、clone、pull するための CLI です。対話式のターミナル UI、並列 Git タスク、実際の Git 進捗表示、クロスプラットフォームの単一実行ファイルのビルドに対応しています。

## 機能

- GitLab と GitHub に対応。
- `@clack/prompts` による対話式プロンプト。
- `list`、`clone`、`pull` の一括操作。
- 並列 clone/pull と `現在/合計` の進捗表示。
- Git の進捗を解析し、テキストの進捗バーとして表示。
- HTTPS Token 認証は一時的な `GIT_ASKPASS` 経由で行い、Token を clone URL に埋め込みません。
- `bun build --compile` による単一実行ファイルのビルド。

## 要件

- Git がインストールされ、`PATH` から実行できること。
- 設定した Git プロバイダーへネットワーク接続できること。
- ローカル開発には Bun が必要です。Release のバイナリには Bun ランタイムが含まれています。

## 設定

サンプル設定をコピーします。

```bash
cp .env.example .env
```

GitLab の例：

```env
GIT_PROVIDER=gitlab
GIT_BASE_URL=http://127.0.0.1/
GIT_API_URL=http://127.0.0.1/api/v4/
GIT_TOKEN=personal_access_token
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=oauth2
```

GitHub の例：

```env
GIT_PROVIDER=github
GIT_BASE_URL=https://github.com/
GIT_API_URL=https://api.github.com/
GIT_TOKEN=personal_access_token
GIT_TARGET_DIR=./git-projects
GIT_USERNAME=x-access-token
```

## 使い方

対話モード：

```bash
bun run start
```

リポジトリ一覧：

```bash
bun run list
```

不足しているリポジトリを clone：

```bash
bun run clone
```

既存リポジトリを pull：

```bash
bun run pull
```

JSON 出力：

```bash
bun run list -- --json
```

clone 時に既存リポジトリも pull：

```bash
bun run clone -- --update
```

進捗表示の例：

```text
[克隆:进度] 07/80 group/project [############----------]  55% 接收对象（已完成 42/80）
```

CLI の実際の表示文言は中国語です。

## CLI オプション

- `--provider gitlab|github`：プロバイダーを選択します。デフォルトは `gitlab`。
- `--base-url <url>`：プロバイダーの Web URL。
- `--api-url <url>`：プロバイダーの API URL。省略時は `--base-url` から推測します。
- `--token <token>`：個人アクセストークン。`GIT_TOKEN` の利用を推奨します。
- `--dir <path>`：ローカルの保存先ディレクトリ。
- `--clone-url http|ssh`：clone URL の種類。デフォルトは `http`。
- `--git-username <name>`：HTTPS Git ユーザー名。GitLab は `oauth2`、GitHub は `x-access-token` がデフォルトです。
- `--concurrency <n>`：並列 Git タスク数。デフォルトは `4`。
- `--progress-interval <sec>`：長時間実行される Git タスクのハートビート間隔。`0` で無効化します。
- `--skip-archived`：アーカイブ済みリポジトリをスキップします。
- `--dry-run`：実行予定の Git コマンドだけを表示します。
- `--flat`：group/subgroup を保持せず、プロジェクト名だけで保存します。名前が重複すると衝突する可能性があります。
- `--json`：`list` コマンドで JSON を出力します。
- `--show-token`：対話モードで Token 全体を表示します。

## バイナリのビルド

設定済みの全ターゲットをビルド：

```bash
bun run build:bin
```

現在のプラットフォームだけをビルド：

```bash
bun run build:bin:current
```

指定した Bun target をビルド：

```bash
bun run build:bin -- --target bun-linux-x64
```

デフォルト出力：

```text
dist/repo-sweep-darwin-arm64
dist/repo-sweep-darwin-x64
dist/repo-sweep-linux-x64
dist/repo-sweep-linux-arm64
dist/repo-sweep-windows-x64.exe
dist/README.txt
```

## Release

Release assets は通常 CI パイプラインで生成します。GitHub では GitHub Actions がよく使われます。tag を push すると workflow が起動し、依存関係のインストール、クロスプラットフォームビルド、GitHub Release の作成、assets へのアップロードを行います。

このリポジトリには `.github/workflows/release.yml` が含まれています。Release の公開方法：

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions は自動で次を実行します。

1. Bun をインストール。
2. 依存関係をインストール。
3. TypeScript チェックを実行。
4. `dist` にクロスプラットフォームバイナリをビルド。
5. `dist` 内のファイルを GitHub Release assets にアップロード。

workflow は GitHub 組み込みの `GITHUB_TOKEN` を使います。通常の公開リポジトリでは Release assets のアップロードに追加 Token は不要です。リポジトリの Actions 権限で `contents: write` が許可されていることを確認してください。

## 開発

依存関係をインストール：

```bash
bun install
```

型チェック：

```bash
bun run typecheck
```

CLI をローカルで実行：

```bash
bun run start
```

## ライセンス

MIT License。詳細は [LICENSE](LICENSE) を参照してください。
