#!/usr/bin/env bun

import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

interface BuildTarget {
  name: string;
  target: string;
  outfile: string;
}

const DIST_DIR = resolve("dist");
const ENTRYPOINT = resolve("src/repo-sweep.ts");
const TARGETS: BuildTarget[] = [
  {
    name: "macOS Apple 芯片",
    target: "bun-darwin-arm64",
    outfile: "repo-sweep-darwin-arm64",
  },
  {
    name: "macOS Intel 芯片",
    target: "bun-darwin-x64",
    outfile: "repo-sweep-darwin-x64",
  },
  {
    name: "Linux x64",
    target: "bun-linux-x64",
    outfile: "repo-sweep-linux-x64",
  },
  {
    name: "Linux arm64",
    target: "bun-linux-arm64",
    outfile: "repo-sweep-linux-arm64",
  },
  {
    name: "Windows x64",
    target: "bun-windows-x64",
    outfile: "repo-sweep-windows-x64.exe",
  },
];

function printHelp(): void {
  console.log(`二进制构建脚本

用法：
  bun run build:bin [选项]

选项：
  --all                 构建所有平台，默认行为
  --current             只构建当前系统对应的平台
  --target <target>     只构建指定 Bun target，可重复或逗号分隔
  --no-clean            构建前不清空 dist 目录
  --help                显示帮助

可用 target：
${TARGETS.map((target) => `  ${target.target.padEnd(18)} ${target.name}`).join(
    "\n",
  )}
`);
}

function argValues(name: string): string[] {
  const values: string[] = [];
  const args = Bun.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === name) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        values.push(next);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    }
  }

  return values.flatMap((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function hasFlag(name: string): boolean {
  return Bun.argv.slice(2).includes(name);
}

function currentTarget(): string | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") {
    return "bun-darwin-arm64";
  }

  if (platform === "darwin" && arch === "x64") {
    return "bun-darwin-x64";
  }

  if (platform === "linux" && arch === "x64") {
    return "bun-linux-x64";
  }

  if (platform === "linux" && arch === "arm64") {
    return "bun-linux-arm64";
  }

  if (platform === "win32" && arch === "x64") {
    return "bun-windows-x64";
  }

  return null;
}

function selectTargets(): BuildTarget[] {
  const requestedTargets = argValues("--target");

  if (hasFlag("--current")) {
    const target = currentTarget();
    if (!target) {
      throw new Error(
        `当前平台暂未配置构建目标：${process.platform}/${process.arch}`,
      );
    }
    requestedTargets.push(target);
  }

  if (requestedTargets.length === 0 || hasFlag("--all")) {
    return TARGETS;
  }

  return requestedTargets.map((targetName) => {
    const target = TARGETS.find((item) => item.target === targetName);
    if (!target) {
      throw new Error(`不支持的构建目标：${targetName}`);
    }
    return target;
  });
}

async function runBuild(target: BuildTarget): Promise<void> {
  const outfile = join(DIST_DIR, target.outfile);
  const args = [
    "build",
    "--compile",
    "--compile-autoload-dotenv",
    "--minify",
    `--target=${target.target}`,
    `--outfile=${outfile}`,
    ENTRYPOINT,
  ];

  console.log(`\n开始构建：${target.name} (${target.target})`);
  const proc = Bun.spawn(["bun", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`构建失败：${target.target}，退出码 ${exitCode}`);
  }

  console.log(`构建完成：${outfile}`);
}

async function writeDistReadme(targets: BuildTarget[]): Promise<void> {
  const readme = `Repo Sweep

这些可执行文件已经包含 Bun 运行时，不需要安装 Node.js 或 Bun。
仍然需要系统里有 git 命令，并且能访问配置的平台地址。

使用方式：
  macOS / Linux:
    ./repo-sweep-<平台>

  Windows:
    repo-sweep-windows-x64.exe

可在可执行文件旁边放一个 .env 文件：
  GIT_PROVIDER=gitlab
  GIT_BASE_URL=http://127.0.0.1/
  GIT_API_URL=http://127.0.0.1/api/v4/
  GIT_TOKEN=个人访问令牌
  GIT_TARGET_DIR=目标目录

本次构建产物：
${targets.map((target) => `  - ${target.outfile}`).join("\n")}
`;

  await Bun.write(join(DIST_DIR, "README.txt"), readme);
}

async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const targets = selectTargets();

  if (!hasFlag("--no-clean")) {
    await rm(DIST_DIR, { recursive: true, force: true });
  }

  await mkdir(DIST_DIR, { recursive: true });

  for (const target of targets) {
    await runBuild(target);
  }

  await writeDistReadme(targets);
  console.log(`\n全部构建完成，输出目录：${DIST_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
