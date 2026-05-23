#!/usr/bin/env bun

import { chmod, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import * as p from "@clack/prompts";
import {
  getProvider,
  listProviders,
  normalizeUrl,
  parseProviderName,
  type Project,
  type ProviderName,
} from "./providers";

type CommandName = "list" | "clone" | "pull";
type CloneUrlMode = "http" | "ssh";

interface Options {
  command: CommandName;
  providerName: ProviderName;
  baseUrl: string;
  apiUrl: string;
  token: string;
  targetDir: string;
  cloneUrlMode: CloneUrlMode;
  gitUsername: string;
  concurrency: number;
  progressIntervalMs: number;
  dryRun: boolean;
  flat: boolean;
  update: boolean;
  json: boolean;
  skipArchived: boolean;
  showToken: boolean;
}

interface TaskResult {
  ok: boolean;
  label: string;
  message?: string;
}

interface ProgressContext {
  action: string;
  label: string;
  index: number;
  total: number;
  getCompleted: () => number;
}

interface GitProgressReporter {
  write: (text: string) => void;
  flush: () => void;
}

interface CompletedCounter {
  value: number;
}

const DEFAULT_TARGET_DIR = "./git-projects";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_PROGRESS_INTERVAL_SECONDS = 15;
const CAPTURE_LIMIT = 20_000;
const SKIP_PREFIX = "跳过：";
const BOOLEAN_FLAGS = new Set([
  "dry-run",
  "flat",
  "help",
  "json",
  "show-token",
  "skip-archived",
  "update",
]);

function printHelp(): void {
  console.log(`Repo Sweep

用法：
  repo-sweep <命令> [选项]

命令：
  list                 查看当前账号参与的项目列表
  clone                批量克隆项目到目标目录
  pull                 批量拉取本地已存在的项目

选项：
  --provider <name>    平台，可选 gitlab 或 github，默认 gitlab
  --dir <path>         目标根目录
  --base-url <url>     平台地址，GitLab 示例 http://127.0.0.1/
  --api-url <url>      API 地址，可不填，默认按平台地址推导
  --token <token>      平台访问令牌，推荐使用 GIT_TOKEN 环境变量
  --clone-url <mode>   http 或 ssh，默认 http
  --git-username <name>
                       HTTP Git 认证用户名，默认按平台选择
  --concurrency <n>    并发 Git 任务数，默认 ${DEFAULT_CONCURRENCY}
  --progress-interval <sec>
                       长时间 Git 任务的心跳日志间隔，默认 ${DEFAULT_PROGRESS_INTERVAL_SECONDS}
  --skip-archived      跳过已归档项目
  --dry-run            只打印将要执行的命令，不真正执行 Git 命令
  --flat               使用 <目录>/<项目名>，不保留 group/subgroup 目录
  --update             clone 时顺便拉取已存在的仓库
  --json               list 命令输出 JSON
  --show-token         交互模式中显示完整 Token

环境变量：
  GIT_PROVIDER         gitlab 或 github
  GIT_BASE_URL         平台地址
  GIT_API_URL          API 地址
  GIT_TOKEN            个人访问令牌
  GIT_TARGET_DIR       目标根目录
  GIT_CLONE_URL        http 或 ssh
  GIT_USERNAME         HTTP Git 认证用户名
  GIT_CONCURRENCY      并发 Git 任务数
  GIT_PROGRESS_INTERVAL
                       心跳日志间隔，单位秒
  GIT_SKIP_ARCHIVED    设置为 1 后跳过已归档项目
  GIT_SHOW_TOKEN       设置为 1 后，交互模式显示完整 Token
`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith("--")) {
      continue;
    }

    const raw = arg.slice(2);
    const [key, value] = raw.split("=", 2);

    if (value !== undefined) {
      parsed[key] = value;
      continue;
    }

    if (BOOLEAN_FLAGS.has(key)) {
      parsed[key] = true;
      continue;
    }

    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    i += 1;
  }

  return parsed;
}

function optionString(
  options: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function optionBool(
  options: Record<string, string | boolean>,
  key: string,
): boolean {
  const value = options[key];
  return value === true || value === "true" || value === "1";
}

function parseIntOption(
  value: string | undefined,
  fallback: number,
  minimum: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, parsed);
}

function parseCommand(raw: string | undefined): CommandName | null {
  if (raw === "list" || raw === "clone" || raw === "pull") {
    return raw;
  }

  return null;
}

function commandActionLabel(command: CommandName): string {
  switch (command) {
    case "clone":
      return "克隆";
    case "pull":
      return "拉取";
    case "list":
      return "列表";
  }
}

function getCliParts(): {
  parsedCommand: CommandName | null;
  rawOptions: Record<string, string | boolean>;
} {
  const args = Bun.argv.slice(2);
  const parsedCommand = parseCommand(args[0]);
  const rawOptions = parseArgs(args.slice(parsedCommand ? 1 : 0));

  return { parsedCommand, rawOptions };
}

function buildOptions(
  command: CommandName,
  rawOptions: Record<string, string | boolean>,
): Options {
  const env = Bun.env;
  const providerName = parseProviderName(
    optionString(rawOptions, "provider") || env.GIT_PROVIDER,
  );
  const provider = getProvider(providerName);
  const baseUrl = normalizeUrl(
    optionString(rawOptions, "base-url") ||
      env.GIT_BASE_URL ||
      provider.defaultBaseUrl,
  );
  const apiUrl = normalizeUrl(
    optionString(rawOptions, "api-url") ||
      env.GIT_API_URL ||
      provider.defaultApiUrl(baseUrl),
  );
  const token = optionString(rawOptions, "token") || env.GIT_TOKEN || "";
  const targetDir = resolve(
    optionString(rawOptions, "dir") ||
      optionString(rawOptions, "d") ||
      env.GIT_TARGET_DIR ||
      DEFAULT_TARGET_DIR,
  );
  const cloneUrlMode =
    (optionString(rawOptions, "clone-url") || env.GIT_CLONE_URL || "http") ===
    "ssh"
      ? "ssh"
      : "http";
  const gitUsername =
    optionString(rawOptions, "git-username") ||
    env.GIT_USERNAME ||
    provider.defaultGitUsername;
  const concurrency = parseIntOption(
    optionString(rawOptions, "concurrency") || env.GIT_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    1,
  );
  const progressIntervalMs =
    parseIntOption(
      optionString(rawOptions, "progress-interval") ||
        env.GIT_PROGRESS_INTERVAL,
      DEFAULT_PROGRESS_INTERVAL_SECONDS,
      0,
    ) * 1000;

  return {
    command,
    providerName,
    baseUrl,
    apiUrl,
    token,
    targetDir,
    cloneUrlMode,
    gitUsername,
    concurrency,
    progressIntervalMs,
    dryRun: optionBool(rawOptions, "dry-run"),
    flat: optionBool(rawOptions, "flat"),
    update: optionBool(rawOptions, "update"),
    json: optionBool(rawOptions, "json"),
    skipArchived:
      optionBool(rawOptions, "skip-archived") || env.GIT_SKIP_ARCHIVED === "1",
    showToken: optionBool(rawOptions, "show-token") || env.GIT_SHOW_TOKEN === "1",
  };
}

function parseOptions(): Options | null {
  const { parsedCommand, rawOptions } = getCliParts();

  if (!parsedCommand || optionBool(rawOptions, "help")) {
    return null;
  }

  return buildOptions(parsedCommand, rawOptions);
}

function parseInteractiveBaseOptions(): Options {
  const { rawOptions } = getCliParts();
  return buildOptions("clone", rawOptions);
}

function wantsHelp(): boolean {
  return optionBool(getCliParts().rawOptions, "help");
}

function formatTokenForDisplay(token: string, showFull: boolean): string {
  if (!token) {
    return "（未配置）";
  }

  if (showFull) {
    return token;
  }

  if (token.length <= 10) {
    return `${token.slice(0, 2)}***${token.slice(-2)}`;
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}（${token.length} 位）`;
}

function printInteractiveConfig(options: Options): void {
  const provider = getProvider(options.providerName);
  p.note(
    [
      `平台：      ${provider.label}`,
      `平台地址：  ${options.baseUrl}`,
      `API 地址：  ${options.apiUrl}`,
      `克隆目录：  ${options.targetDir}`,
      `Token：     ${formatTokenForDisplay(
        options.token,
        options.showToken,
      )}`,
      `克隆地址：  ${options.cloneUrlMode}`,
      `Git 用户名：${options.gitUsername}`,
      `并发数量：  ${options.concurrency}`,
      `心跳日志：  ${
        options.progressIntervalMs > 0
          ? `${options.progressIntervalMs / 1000} 秒`
          : "关闭"
      }`,
    ].join("\n"),
    "当前配置",
  );
}

async function promptInteractiveOptions(
  baseOptions: Options,
): Promise<Options | null> {
  p.intro("Repo Sweep");

  const providerName = await p.select<ProviderName>({
    message: "选择平台",
    initialValue: baseOptions.providerName,
    options: listProviders().map((provider) => ({
      value: provider.name,
      label: provider.label,
    })),
  });

  if (p.isCancel(providerName)) {
    p.cancel("已取消。");
    return null;
  }

  const provider = getProvider(providerName);
  const providerChanged = providerName !== baseOptions.providerName;
  const baseUrlInitial = providerChanged
    ? provider.defaultBaseUrl
    : baseOptions.baseUrl;
  const apiUrlInitial = providerChanged
    ? provider.defaultApiUrl(baseUrlInitial)
    : baseOptions.apiUrl;
  const gitUsernameInitial = providerChanged
    ? provider.defaultGitUsername
    : baseOptions.gitUsername;
  const previewOptions: Options = {
    ...baseOptions,
    providerName,
    baseUrl: baseUrlInitial,
    apiUrl: normalizeUrl(apiUrlInitial),
    gitUsername: gitUsernameInitial,
  };
  printInteractiveConfig(previewOptions);

  const baseUrlAnswer = await p.text({
    message: "平台地址",
    initialValue: previewOptions.baseUrl,
    validate(value) {
      if (!value?.trim()) {
        return "平台地址不能为空。";
      }
      try {
        new URL(value);
      } catch {
        return "请输入合法的 URL。";
      }
      return undefined;
    },
  });

  if (p.isCancel(baseUrlAnswer)) {
    p.cancel("已取消。");
    return null;
  }

  const baseUrl = normalizeUrl(baseUrlAnswer.trim());
  const defaultPreviewApiUrl = normalizeUrl(
    provider.defaultApiUrl(previewOptions.baseUrl),
  );
  const apiUrlInitialForPrompt =
    previewOptions.apiUrl === defaultPreviewApiUrl
      ? provider.defaultApiUrl(baseUrl)
      : previewOptions.apiUrl;
  const apiUrlAnswer = await p.text({
    message: "API 地址",
    initialValue: apiUrlInitialForPrompt,
    validate(value) {
      if (!value?.trim()) {
        return "API 地址不能为空。";
      }
      try {
        new URL(value);
      } catch {
        return "请输入合法的 URL。";
      }
      return undefined;
    },
  });

  if (p.isCancel(apiUrlAnswer)) {
    p.cancel("已取消。");
    return null;
  }

  const gitUsernameAnswer = await p.text({
    message: "HTTP Git 认证用户名",
    initialValue: gitUsernameInitial,
    validate(value) {
      if (!value?.trim()) {
        return "HTTP Git 认证用户名不能为空。";
      }
      return undefined;
    },
  });

  if (p.isCancel(gitUsernameAnswer)) {
    p.cancel("已取消。");
    return null;
  }

  const targetDirAnswer = await p.text({
    message: "克隆目录",
    initialValue: baseOptions.targetDir,
    validate(value) {
      if (!value?.trim()) {
        return "克隆目录不能为空。";
      }
      return undefined;
    },
  });

  if (p.isCancel(targetDirAnswer)) {
    p.cancel("已取消。");
    return null;
  }

  let token = baseOptions.token;
  if (token) {
    const tokenAction = await p.select<"keep" | "replace">({
      message: "平台访问令牌",
      initialValue: "keep",
      options: [
        {
          value: "keep",
          label: "保留当前访问令牌",
          hint: formatTokenForDisplay(token, baseOptions.showToken),
        },
        {
          value: "replace",
          label: "替换访问令牌",
          hint: "输入时会被隐藏",
        },
      ],
    });

    if (p.isCancel(tokenAction)) {
      p.cancel("已取消。");
      return null;
    }

    if (tokenAction === "replace") {
      const nextToken = await p.password({
        message: "新的平台访问令牌",
        validate(value) {
          if (!value?.trim()) {
            return "平台访问令牌不能为空。";
          }
          return undefined;
        },
      });

      if (p.isCancel(nextToken)) {
        p.cancel("已取消。");
        return null;
      }

      token = nextToken.trim();
    }
  } else {
    const nextToken = await p.password({
      message: "平台访问令牌",
      validate(value) {
        if (!value?.trim()) {
          return "平台访问令牌不能为空。";
        }
        return undefined;
      },
    });

    if (p.isCancel(nextToken)) {
      p.cancel("已取消。");
      return null;
    }

    token = nextToken.trim();
  }

  const command = await p.select<"clone" | "pull">({
    message: "选择操作",
    initialValue: "clone",
    options: [
      {
        value: "clone",
        label: "克隆",
        hint: "克隆目录中缺失的项目",
      },
      {
        value: "pull",
        label: "拉取",
        hint: "拉取本地已经存在的项目",
      },
    ],
  });

  if (p.isCancel(command)) {
    p.cancel("已取消。");
    return null;
  }

  let update = false;
  if (command === "clone") {
    const shouldUpdate = await p.confirm({
      message: "克隆时是否顺便拉取已存在的仓库？",
      initialValue: false,
    });

    if (p.isCancel(shouldUpdate)) {
      p.cancel("已取消。");
      return null;
    }

    update = shouldUpdate;
  }

  const options: Options = {
    ...previewOptions,
    command,
    baseUrl,
    apiUrl: normalizeUrl(apiUrlAnswer.trim()),
    token,
    targetDir: resolve(targetDirAnswer.trim()),
    gitUsername: gitUsernameAnswer.trim(),
    update,
  };

  p.outro(`开始执行：${commandActionLabel(command)}，目录：${options.targetDir}`);
  return options;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function networkHelp(options: Options): string {
  const provider = getProvider(options.providerName);
  return [
    `无法连接 ${provider.label}：${options.baseUrl}`,
    "请检查：",
    "1. 当前网络是否可访问该平台，或是否需要内网/VPN。",
    "2. 平台地址是否正确。",
    "3. 浏览器是否能打开该平台地址。",
    "4. 公司代理、防火墙或 DNS 是否阻止访问。",
  ].join("\n");
}

function gitInstallHelp(): string {
  return [
    "未检测到 git 命令。",
    "当前程序已经包含 Bun 运行时，不需要安装 Node.js 或 Bun；但仍然需要系统安装 Git。",
    "请先安装 Git，并确认在终端中可以执行：git --version",
    "macOS 可安装 Xcode Command Line Tools 或 Git；Windows 可安装 Git for Windows。",
  ].join("\n");
}

async function pipeToText(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
): Promise<string> {
  if (!stream || typeof stream === "number") {
    return "";
  }

  return new Response(stream).text();
}

async function ensureGitAvailable(): Promise<void> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["git", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new Error(`${gitInstallHelp()}\n\n原始错误：${formatUnknownError(error)}`);
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    pipeToText(proc.stdout),
    pipeToText(proc.stderr),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    throw new Error(
      `${gitInstallHelp()}${details ? `\n\n原始输出：\n${details}` : ""}`,
    );
  }
}

async function fetchProjects(options: Options): Promise<Project[]> {
  if (!options.token) {
    throw new Error(
      "缺少平台访问令牌。请在 .env 中设置 GIT_TOKEN，或通过 --token 传入。",
    );
  }

  const provider = getProvider(options.providerName);
  return provider.listProjects({
    providerName: options.providerName,
    baseUrl: options.baseUrl,
    apiUrl: options.apiUrl,
    token: options.token,
    skipArchived: options.skipArchived,
  });
}

function safeSegment(segment: string): string {
  const cleaned = segment.replace(/[<>:"\\|?*\x00-\x1F]/g, "_").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "_";
  }

  return cleaned;
}

function projectRelativePath(project: Project, flat: boolean): string {
  const raw = flat ? project.path : project.pathWithNamespace;
  return raw.split("/").map(safeSegment).join("/");
}

function projectLocalPath(options: Options, project: Project): string {
  return join(options.targetDir, projectRelativePath(project, options.flat));
}

function projectCloneUrl(options: Options, project: Project): string {
  return options.cloneUrlMode === "ssh" ? project.sshUrl : project.httpUrl;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(path: string): Promise<boolean> {
  return pathExists(join(path, ".git"));
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=@%+.,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function formatPosition(index: number, total: number): string {
  const width = String(total).length;
  return `${String(index + 1).padStart(width, "0")}/${total}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} 秒`;
  }

  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

function progressBar(percent: number, width = 22): string {
  const bounded = Math.max(0, Math.min(100, percent));
  const filled = Math.round((bounded / 100) * width);
  return `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function appendCapture(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= CAPTURE_LIMIT) {
    return next;
  }

  return next.slice(next.length - CAPTURE_LIMIT);
}

function createGitEnv(
  options: Options,
  askPassPath: string | null,
): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(Bun.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  env.GIT_TOKEN = options.token;
  env.GIT_USERNAME = options.gitUsername;
  env.GIT_TERMINAL_PROMPT = "0";

  if (askPassPath) {
    env.GIT_ASKPASS = askPassPath;
  }

  return env;
}

function parseGitProgress(line: string): { stage: string; percent: number } | null {
  let cleaned = stripAnsi(line).replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/^remote:\s+/, "");
  const match = cleaned.match(/^([^:]+):\s+(\d{1,3})%/);

  if (!match) {
    return null;
  }

  return {
    stage: translateGitStage(match[1].trim()),
    percent: Number.parseInt(match[2], 10),
  };
}

function translateGitStage(stage: string): string {
  const map: Record<string, string> = {
    "Checking connectivity": "检查连接",
    "Checking out files": "检出文件",
    "Compressing objects": "压缩对象",
    "Counting objects": "统计对象",
    "Enumerating objects": "枚举对象",
    "Finding sources": "查找源对象",
    "Receiving objects": "接收对象",
    "Resolving deltas": "解析差异",
    "Updating files": "更新文件",
    "Writing objects": "写入对象",
  };

  return map[stage] || stage;
}

function createGitProgressReporter(
  progress: ProgressContext | undefined,
): GitProgressReporter {
  let buffer = "";
  let lastKey = "";
  let lastPrintedAt = 0;

  function print(line: string, force = false): void {
    if (!progress) {
      return;
    }

    const parsed = parseGitProgress(line);
    if (!parsed) {
      return;
    }

    const now = Date.now();
    const key = `${parsed.stage}:${parsed.percent}`;
    if (!force && key === lastKey) {
      return;
    }
    if (!force && parsed.percent < 100 && now - lastPrintedAt < 800) {
      return;
    }

    lastKey = key;
    lastPrintedAt = now;
    console.log(
      `[${progress.action}:进度] ${formatPosition(
        progress.index,
        progress.total,
      )} ${progress.label} ` +
        `[${progressBar(parsed.percent)}] ${String(parsed.percent).padStart(
          3,
          " ",
        )}% ${parsed.stage}（已完成 ${progress.getCompleted()}/${
          progress.total
        }）`,
    );
  }

  return {
    write(text: string) {
      buffer += text;
      const parts = buffer.split(/\r|\n/);
      buffer = parts.pop() || "";

      for (const part of parts) {
        print(part);
      }
    },
    flush() {
      if (buffer) {
        print(buffer, true);
        buffer = "";
      }
    },
  };
}

async function withTaskLog(
  action: string,
  index: number,
  total: number,
  label: string,
  counter: CompletedCounter,
  task: (context: ProgressContext) => Promise<TaskResult>,
): Promise<TaskResult> {
  const startedAt = Date.now();
  const position = formatPosition(index, total);
  console.log(`[${action}:开始] ${position} ${label}`);

  try {
    const result = await task({
      action,
      label,
      index,
      total,
      getCompleted: () => counter.value,
    });
    counter.value += 1;
    const status = result.message?.startsWith(SKIP_PREFIX) ? "跳过" : "完成";
    console.log(
      `[${action}:${status}] ${position} ${label} ` +
        `（已处理 ${counter.value}/${total}，耗时 ${formatDuration(
          Date.now() - startedAt,
        )}）`,
    );
    return result;
  } catch (error) {
    counter.value += 1;
    console.error(
      `[${action}:失败] ${position} ${label} ` +
        `（已处理 ${counter.value}/${total}，耗时 ${formatDuration(
          Date.now() - startedAt,
        )}）`,
    );
    throw error;
  }
}

async function createAskPass(options: Options): Promise<string | null> {
  if (!options.token || options.cloneUrlMode !== "http") {
    return null;
  }

  const path = join(tmpdir(), `repo-sweep-askpass-${Date.now()}.sh`);
  await Bun.write(
    path,
    `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' "$GIT_USERNAME" ;;
  *Password*) printf '%s\\n' "$GIT_TOKEN" ;;
  *) printf '\\n' ;;
esac
`,
  );
  await chmod(path, 0o700);
  return path;
}

async function readProcessStream(
  stream: ReadableStream<Uint8Array> | null,
  onText: (text: string) => void,
): Promise<string> {
  if (!stream) {
    return "";
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let captured = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const text = decoder.decode(value, { stream: true });
    captured = appendCapture(captured, text);
    onText(text);
  }

  const tail = decoder.decode();
  if (tail) {
    captured = appendCapture(captured, tail);
    onText(tail);
  }

  return captured;
}

async function runGit(
  args: string[],
  cwd: string | undefined,
  options: Options,
  askPassPath: string | null,
  progress?: ProgressContext,
): Promise<void> {
  const cwdLabel = cwd ? ` -C ${shellQuote(cwd)}` : "";
  const commandLabel = `git${cwdLabel} ${args.map(shellQuote).join(" ")}`;

  if (options.dryRun) {
    console.log(`[演练] ${commandLabel}`);
    return;
  }

  const env = createGitEnv(options, askPassPath);

  const startedAt = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  if (progress && options.progressIntervalMs > 0) {
    heartbeat = setInterval(() => {
      console.log(
        `[${progress.action}:等待] ${formatPosition(
          progress.index,
          progress.total,
        )} ${progress.label} 仍在运行，已耗时 ` +
          `${formatDuration(Date.now() - startedAt)} ` +
          `（已完成 ${progress.getCompleted()}/${progress.total}）`,
      );
    }, options.progressIntervalMs);
  }

  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const gitProgress = createGitProgressReporter(progress);
    const [stdout, stderr, exitCode] = await Promise.all([
      readProcessStream(proc.stdout, (text) => gitProgress.write(text)),
      readProcessStream(proc.stderr, (text) => gitProgress.write(text)),
      proc.exited,
    ]);
    gitProgress.flush();

    if (exitCode !== 0) {
      const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      const help = looksLikeGitNetworkError(details)
        ? `\n\n${networkHelp(options)}`
        : "";
      throw new Error(
        `${commandLabel} 执行失败，退出码 ${exitCode}\n${details}${help}`,
      );
    }
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
  }
}

function isMissingConfiguredRefError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("no such ref was fetched");
}

function looksLikeGitNetworkError(message: string): boolean {
  return [
    "Could not resolve host",
    "Failed to connect",
    "Connection timed out",
    "Connection refused",
    "Network is unreachable",
    "Operation timed out",
    "unable to access",
    "Could not read from remote repository",
    "The requested URL returned error",
  ].some((pattern) => message.includes(pattern));
}

async function remoteHasNoHeads(
  cwd: string,
  options: Options,
  askPassPath: string | null,
): Promise<boolean> {
  if (options.dryRun) {
    return false;
  }

  const proc = Bun.spawn(["git", "ls-remote", "--heads", "origin"], {
    cwd,
    env: createGitEnv(options, askPassPath),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return false;
  }

  return stdout.trim().length === 0;
}

async function pullProjectRepository(
  project: Project,
  localPath: string,
  label: string,
  options: Options,
  askPassPath: string | null,
  progress: ProgressContext,
): Promise<TaskResult> {
  if (project.emptyRepo) {
    return { ok: true, label, message: `${SKIP_PREFIX}远端空仓库` };
  }

  try {
    await runGit(
      ["pull", "--ff-only", "--progress"],
      localPath,
      options,
      askPassPath,
      progress,
    );
    return { ok: true, label };
  } catch (error) {
    if (
      isMissingConfiguredRefError(error) &&
      (await remoteHasNoHeads(localPath, options, askPassPath))
    ) {
      return { ok: true, label, message: `${SKIP_PREFIX}远端空仓库` };
    }

    throw error;
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TaskResult>,
  labelForItem?: (item: T, index: number) => string,
): Promise<TaskResult[]> {
  const results: TaskResult[] = new Array(items.length);
  let nextIndex = 0;

  async function consume(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          ok: false,
          label: labelForItem?.(items[index], index) || `第 ${index + 1} 项`,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, consume),
  );

  return results;
}

function printProjectSummary(projects: Project[], options: Options): void {
  const provider = getProvider(options.providerName);
  const archived = projects.filter((project) => project.archived).length;
  console.log(
    `队列：${projects.length} 个项目，来源 ${provider.label} ${options.baseUrl}` +
      (archived ? `，其中 ${archived} 个已归档` : ""),
  );
  console.log(`目标目录：${options.targetDir}`);
  console.log(
    `并发任务：${
      projects.length === 0 ? 0 : Math.min(options.concurrency, projects.length)
    }${
      options.progressIntervalMs > 0
        ? `，心跳 ${options.progressIntervalMs / 1000} 秒`
        : "，心跳关闭"
    }`,
  );
}

function printResults(results: TaskResult[]): void {
  const failed = results.filter((result) => !result.ok);
  const skipped = results.filter(
    (result) => result.ok && result.message?.startsWith(SKIP_PREFIX),
  );
  const changed = results.length - failed.length - skipped.length;

  console.log(
    `完成：${changed} 个成功，${skipped.length} 个跳过，${failed.length} 个失败。`,
  );

  for (const result of failed) {
    console.error(`\n[失败] ${result.label}`);
    if (result.message) {
      console.error(result.message);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function listProjects(
  projects: Project[],
  options: Options,
): Promise<void> {
  if (options.json) {
    console.log(
      JSON.stringify(
        projects.map((project) => ({
          id: project.id,
          path: project.pathWithNamespace,
          localPath: projectLocalPath(options, project),
          webUrl: project.webUrl,
          archived: project.archived,
          defaultBranch: project.defaultBranch,
        })),
        null,
        2,
      ),
    );
    return;
  }

  for (const project of projects) {
    const archived = project.archived ? " [已归档]" : "";
    console.log(
      `${project.pathWithNamespace}${archived}\n  ${projectLocalPath(
        options,
        project,
      )}\n  ${project.webUrl}`,
    );
  }
}

async function cloneProjects(
  projects: Project[],
  options: Options,
  askPassPath: string | null,
): Promise<void> {
  await mkdir(options.targetDir, { recursive: true });
  const completed: CompletedCounter = { value: 0 };
  const total = projects.length;

  const results = await runPool(
    projects,
    options.concurrency,
    async (project, index) => {
      const label = project.pathWithNamespace;
      const localPath = projectLocalPath(options, project);
      const exists = await pathExists(localPath);

      if (exists) {
        if (!options.update) {
          return withTaskLog("克隆", index, total, label, completed, async () => ({
            ok: true,
            label,
            message: `${SKIP_PREFIX}本地已存在`,
          }));
        }

        return withTaskLog("拉取", index, total, label, completed, async (progress) => {
          if (!(await isGitRepository(localPath))) {
            throw new Error(`${localPath} 已存在，但不是 Git 仓库。`);
          }

          return pullProjectRepository(
            project,
            localPath,
            label,
            options,
            askPassPath,
            progress,
          );
        });
      }

      return withTaskLog("克隆", index, total, label, completed, async (progress) => {
        await mkdir(dirname(localPath), { recursive: true });
        await runGit(
          ["clone", "--progress", projectCloneUrl(options, project), localPath],
          undefined,
          options,
          askPassPath,
          progress,
        );
        return { ok: true, label };
      });
    },
    (project) => project.pathWithNamespace,
  );

  printResults(results);
}

async function pullProjects(
  projects: Project[],
  options: Options,
  askPassPath: string | null,
): Promise<void> {
  const completed: CompletedCounter = { value: 0 };
  const total = projects.length;

  const results = await runPool(
    projects,
    options.concurrency,
    async (project, index) => {
      const label = project.pathWithNamespace;
      const localPath = projectLocalPath(options, project);

      return withTaskLog("拉取", index, total, label, completed, async (progress) => {
        if (!(await pathExists(localPath))) {
          return { ok: true, label, message: `${SKIP_PREFIX}本地不存在` };
        }

        if (!(await isGitRepository(localPath))) {
          throw new Error(`${localPath} 已存在，但不是 Git 仓库。`);
        }

        return pullProjectRepository(
          project,
          localPath,
          label,
          options,
          askPassPath,
          progress,
        );
      });
    },
    (project) => project.pathWithNamespace,
  );

  printResults(results);
}

async function main(): Promise<void> {
  let options = parseOptions();

  if (!options) {
    if (wantsHelp()) {
      printHelp();
      return;
    }

    options = await promptInteractiveOptions(parseInteractiveBaseOptions());
    if (!options) {
      return;
    }
  }

  await ensureGitAvailable();

  const askPassPath = await createAskPass(options);

  try {
    const projects = await fetchProjects(options);
    if (!(options.command === "list" && options.json)) {
      printProjectSummary(projects, options);
    }

    switch (options.command) {
      case "list":
        await listProjects(projects, options);
        break;
      case "clone":
        await cloneProjects(projects, options, askPassPath);
        break;
      case "pull":
        await pullProjects(projects, options, askPassPath);
        break;
    }
  } finally {
    if (askPassPath) {
      await rm(askPassPath, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
