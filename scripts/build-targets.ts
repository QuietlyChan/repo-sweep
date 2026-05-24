export interface BuildTarget {
  name: string;
  bunTarget: string;
  binaryName: string;
  packageName: string;
  packageDir: string;
  packageBinaryName: string;
  os: string;
  cpu: string;
}

export const TARGETS: BuildTarget[] = [
  {
    name: "macOS Apple 芯片",
    bunTarget: "bun-darwin-arm64",
    binaryName: "repo-sweep-darwin-arm64",
    packageName: "@quietlychan/repo-sweep-darwin-arm64",
    packageDir: "repo-sweep-darwin-arm64",
    packageBinaryName: "repo-sweep",
    os: "darwin",
    cpu: "arm64",
  },
  {
    name: "macOS Intel 芯片",
    bunTarget: "bun-darwin-x64",
    binaryName: "repo-sweep-darwin-x64",
    packageName: "@quietlychan/repo-sweep-darwin-x64",
    packageDir: "repo-sweep-darwin-x64",
    packageBinaryName: "repo-sweep",
    os: "darwin",
    cpu: "x64",
  },
  {
    name: "Linux x64",
    bunTarget: "bun-linux-x64",
    binaryName: "repo-sweep-linux-x64",
    packageName: "@quietlychan/repo-sweep-linux-x64",
    packageDir: "repo-sweep-linux-x64",
    packageBinaryName: "repo-sweep",
    os: "linux",
    cpu: "x64",
  },
  {
    name: "Linux arm64",
    bunTarget: "bun-linux-arm64",
    binaryName: "repo-sweep-linux-arm64",
    packageName: "@quietlychan/repo-sweep-linux-arm64",
    packageDir: "repo-sweep-linux-arm64",
    packageBinaryName: "repo-sweep",
    os: "linux",
    cpu: "arm64",
  },
  {
    name: "Windows x64",
    bunTarget: "bun-windows-x64",
    binaryName: "repo-sweep-windows-x64.exe",
    packageName: "@quietlychan/repo-sweep-windows-x64",
    packageDir: "repo-sweep-windows-x64",
    packageBinaryName: "repo-sweep.exe",
    os: "win32",
    cpu: "x64",
  },
];

export function currentBunTarget(): string | null {
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
