#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const platformPackages = {
  "darwin-arm64": {
    name: "@quietlychan/repo-sweep-darwin-arm64",
    binary: "repo-sweep",
  },
  "darwin-x64": {
    name: "@quietlychan/repo-sweep-darwin-x64",
    binary: "repo-sweep",
  },
  "linux-x64": {
    name: "@quietlychan/repo-sweep-linux-x64",
    binary: "repo-sweep",
  },
  "linux-arm64": {
    name: "@quietlychan/repo-sweep-linux-arm64",
    binary: "repo-sweep",
  },
  "win32-x64": {
    name: "@quietlychan/repo-sweep-windows-x64",
    binary: "repo-sweep.exe",
  },
};

function currentPlatformPackage() {
  const key = `${os.platform()}-${os.arch()}`;
  return platformPackages[key];
}

function resolveBinary(info) {
  const packageJsonPath = require.resolve(`${info.name}/package.json`);
  const binaryPath = path.join(
    path.dirname(packageJsonPath),
    "bin",
    info.binary,
  );

  if (!existsSync(binaryPath)) {
    throw new Error(`未找到平台二进制文件：${binaryPath}`);
  }

  return binaryPath;
}

function installPackage(info, targetBinary) {
  const packageJson = JSON.parse(
    readFileSync(path.join(__dirname, "package.json"), "utf8"),
  );
  const version = packageJson.optionalDependencies?.[info.name];

  if (!version) {
    return null;
  }

  const temp = mkdtempSync(path.join(os.tmpdir(), "repo-sweep-install-"));

  try {
    const result = spawnSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-save",
        "--loglevel=error",
        "--prefix",
        temp,
        `${info.name}@${version}`,
      ],
      { stdio: "inherit", windowsHide: true },
    );

    if (result.status !== 0) {
      return false;
    }

    const packageDir = path.join(temp, "node_modules", ...info.name.split("/"));
    const binaryPath = path.join(packageDir, "bin", info.binary);

    if (!existsSync(binaryPath)) {
      return false;
    }

    copyBinary(binaryPath, targetBinary);
    return true;
  } finally {
    if (!process.env.REPO_SWEEP_KEEP_INSTALL_TEMP) {
      rmSync(temp, { recursive: true, force: true });
    }
  }
}

function copyBinary(source, target) {
  mkdirSync(path.dirname(target), { recursive: true });

  if (existsSync(target)) {
    rmSync(target, { force: true });
  }

  try {
    linkSync(source, target);
  } catch {
    copyFileSync(source, target);
  }
  chmodSync(target, 0o755);
}

function main() {
  if (existsSync(path.join(__dirname, "src", "repo-sweep.ts"))) {
    return;
  }

  const info = currentPlatformPackage();

  if (!info) {
    throw new Error(`当前平台暂不支持：${os.platform()}/${os.arch()}`);
  }

  const targetBinary = path.join(__dirname, "bin", "repo-sweep-bin");
  try {
    copyBinary(resolveBinary(info), targetBinary);
    return;
  } catch (error) {
    if (installPackage(info, targetBinary)) {
      return;
    }

    throw new Error(
      [
        `无法安装当前平台二进制包：${info.name}`,
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
