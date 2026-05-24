#!/usr/bin/env bun

import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { currentBunTarget, TARGETS, type BuildTarget } from "./build-targets";

interface RootPackageJson {
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: unknown;
  bugs?: unknown;
  publishConfig?: unknown;
}

const DIST_DIR = resolve("dist");
const DIST_NPM_DIR = resolve("dist-npm");

function printHelp(): void {
  console.log(`npm 平台包构建脚本

用法：
  bun run build:npm [选项]

选项：
  --all                 构建所有平台，默认行为
  --current             只构建当前系统对应的平台
  --target <target>     只构建指定 Bun target，可重复或逗号分隔
  --no-clean            构建前不清空 dist-npm 目录
  --skip-build          不重新编译二进制，只按 dist 里的已有文件生成平台包
  --pack                生成平台包目录后执行 npm pack
  --help                显示帮助
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

function selectTargets(): BuildTarget[] {
  const requestedTargets = argValues("--target");

  if (hasFlag("--current")) {
    const target = currentBunTarget();
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
    const target = TARGETS.find((item) => item.bunTarget === targetName);
    if (!target) {
      throw new Error(`不支持的构建目标：${targetName}`);
    }
    return target;
  });
}

async function buildBinaries(targets: BuildTarget[]): Promise<void> {
  const args = [
    "run",
    "scripts/build.ts",
    "--no-clean",
    "--target",
    targets.map((target) => target.bunTarget).join(","),
  ];
  const proc = Bun.spawn(["bun", ...args], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`二进制构建失败，退出码 ${exitCode}`);
  }
}

async function readRootPackageJson(): Promise<RootPackageJson> {
  return JSON.parse(await readFile(resolve("package.json"), "utf8"));
}

function platformPackageJson(
  rootPackage: RootPackageJson,
  target: BuildTarget,
): Record<string, unknown> {
  return {
    name: target.packageName,
    version: rootPackage.version,
    description: `Repo Sweep binary for ${target.name}.`,
    license: rootPackage.license,
    homepage: rootPackage.homepage,
    repository: rootPackage.repository,
    bugs: rootPackage.bugs,
    os: [target.os],
    cpu: [target.cpu],
    files: ["bin/"],
    publishConfig: rootPackage.publishConfig,
  };
}

async function writePlatformPackage(
  rootPackage: RootPackageJson,
  target: BuildTarget,
): Promise<void> {
  const packageDir = join(DIST_NPM_DIR, target.packageDir);
  const binDir = join(packageDir, "bin");
  const sourceBinary = join(DIST_DIR, target.binaryName);
  const targetBinary = join(binDir, target.packageBinaryName);

  await mkdir(binDir, { recursive: true });
  await copyFile(sourceBinary, targetBinary);
  await chmod(targetBinary, 0o755);
  await writeFile(
    join(packageDir, "package.json"),
    `${JSON.stringify(platformPackageJson(rootPackage, target), null, 2)}\n`,
  );
}

async function packPlatformPackage(target: BuildTarget): Promise<void> {
  const packageDir = join(DIST_NPM_DIR, target.packageDir);
  const proc = Bun.spawn(["npm", "pack", "--pack-destination", DIST_NPM_DIR], {
    cwd: packageDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`${target.packageName} 打包失败，退出码 ${exitCode}`);
  }
}

async function writeReadme(targets: BuildTarget[]): Promise<void> {
  const readme = `Repo Sweep npm 平台包

这些目录是 npm 平台二进制包。发布 npm 时先发布平台包，再发布主包 @quietlychan/repo-sweep。

平台包：
${targets.map((target) => `  - ${target.packageName}`).join("\n")}

发布示例：
${targets
  .map((target) => `  npm publish --access public ${target.packageDir}`)
  .join("\n")}
  npm publish --access public
`;

  await writeFile(join(DIST_NPM_DIR, "README.txt"), readme);
}

async function main(): Promise<void> {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const targets = selectTargets();

  if (!hasFlag("--no-clean")) {
    await rm(DIST_NPM_DIR, { recursive: true, force: true });
  }
  await mkdir(DIST_NPM_DIR, { recursive: true });

  if (!hasFlag("--skip-build")) {
    await buildBinaries(targets);
  }

  const rootPackage = await readRootPackageJson();

  for (const target of targets) {
    await writePlatformPackage(rootPackage, target);
    console.log(`已生成平台包：${target.packageName}`);

    if (hasFlag("--pack")) {
      await packPlatformPackage(target);
    }
  }

  await writeReadme(targets);
  console.log(`\nnpm 平台包输出目录：${DIST_NPM_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
