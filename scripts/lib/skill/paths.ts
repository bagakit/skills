import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const defaultRepoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function toRepoRelative(repoRoot: string, absolutePath: string): string {
  const relative = path.relative(repoRoot, absolutePath);
  return relative === "" ? "." : toPosixPath(relative);
}

export function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function resolvePathFrom(baseDir: string, value: string): string {
  const expanded = expandHome(value);
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(baseDir, expanded);
}

export function defaultGlobalSkillsDir(): string {
  const agentsHome = process.env.AGENTS_HOME ? expandHome(process.env.AGENTS_HOME) : path.join(os.homedir(), ".agents");
  return path.join(agentsHome, "skills");
}

export function defaultGlobalClaudeSkillsDir(): string {
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    ? expandHome(process.env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), ".claude");
  return path.join(claudeConfigDir, "skills");
}

export function defaultRepoLocalCodexSkillsDir(consumerRepoRoot: string): string {
  return path.join(consumerRepoRoot, ".codex", "skills");
}

export function defaultRepoLocalClaudeSkillsDir(consumerRepoRoot: string): string {
  return path.join(consumerRepoRoot, ".claude", "skills");
}

export function defaultDistDir(repoRoot: string): string {
  return path.join(repoRoot, "dist", "skill-packages");
}

export function defaultHostHarnessDistDir(repoRoot: string): string {
  return path.join(repoRoot, "dist", "host-harnesses");
}

export function displayPath(repoRoot: string, absolutePath: string): string {
  const repoRootResolved = path.resolve(repoRoot);
  const absoluteResolved = path.resolve(absolutePath);
  if (absoluteResolved === repoRootResolved) {
    return ".";
  }

  const repoRelative = path.relative(repoRootResolved, absoluteResolved);
  if (repoRelative !== "" && !repoRelative.startsWith("..")) {
    return toPosixPath(repoRelative);
  }

  const homeDir = os.homedir();
  if (absoluteResolved === homeDir) {
    return "~";
  }
  if (absoluteResolved.startsWith(`${homeDir}${path.sep}`)) {
    return `~/${toPosixPath(path.relative(homeDir, absoluteResolved))}`;
  }

  return absoluteResolved;
}
