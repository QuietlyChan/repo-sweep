#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface Options {
  tag: string;
  out: string;
}

function optionValue(args: string[], name: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === name) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        return next;
      }
    }

    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
  }

  return undefined;
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  const tag = optionValue(args, "--tag") || process.env.GITHUB_REF_NAME || "";
  const out = optionValue(args, "--out") || "dist/RELEASE_NOTES.md";

  if (!tag) {
    throw new Error("缺少 Release tag。请通过 --tag 传入，例如 --tag vX.Y.Z。");
  }

  return { tag, out };
}

function extractSection(changelog: string, tag: string): string {
  const heading = new RegExp(`^##\\s+${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const match = changelog.match(heading);

  if (!match || match.index === undefined) {
    return [
      `## ${tag}`,
      "",
      "本次发布暂无手写更新说明。",
      "",
      `完整变更：https://github.com/QuietlyChan/repo-sweep/commits/${tag}`,
      "",
    ].join("\n");
  }

  const sectionStart = match.index;
  const afterHeadingStart = sectionStart + match[0].length;
  const nextHeading = changelog.slice(afterHeadingStart).match(/^##\s+/m);
  const sectionEnd =
    nextHeading?.index === undefined
      ? changelog.length
      : afterHeadingStart + nextHeading.index;

  return changelog.slice(sectionStart, sectionEnd).trimEnd() + "\n";
}

async function main(): Promise<void> {
  const options = parseOptions();
  const changelog = await readFile(resolve("CHANGELOG.md"), "utf8");
  const notes = extractSection(changelog, options.tag);
  const outPath = resolve(options.out);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, notes);
  console.log(`已生成 Release 说明：${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
