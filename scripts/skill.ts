import { parseArgs } from "node:util";

import { loadHostHarnessInventory } from "./lib/host_harness/discovery.ts";
import { initializeHostHarness } from "./lib/host_harness/init.ts";
import type {
  HostHarnessInitResult,
  HostHarnessPackageResult,
  HostHarnessResolution,
  HostHarnessSource,
} from "./lib/host_harness/model.ts";
import { distributeHostHarnessPackages } from "./lib/host_harness/packaging.ts";
import { resolveHostHarnessSelector } from "./lib/host_harness/selectors.ts";
import { checkCanonicalSkillLayout } from "./lib/skill/check.ts";
import { loadSkillInventory } from "./lib/skill/discovery.ts";
import { scanSkillInstallStatus, type SkillInstallStatusResult } from "./lib/skill/install_status.ts";
import { linkSkills, linkSkillsToDestinations } from "./lib/skill/linking.ts";
import type { LinkResult, PackageResult, SkillResolution, SkillSource } from "./lib/skill/model.ts";
import {
  defaultDistDir,
  defaultGlobalClaudeSkillsDir,
  defaultGlobalSkillsDir,
  defaultHostHarnessDistDir,
  defaultRepoLocalClaudeSkillsDir,
  defaultRepoLocalCodexSkillsDir,
  defaultRepoRoot,
  displayPath,
  resolvePathFrom,
} from "./lib/skill/paths.ts";
import { distributePackages } from "./lib/skill/packaging.ts";
import { resolveSkillSelector } from "./lib/skill/selectors.ts";

type JsonSkill = Readonly<{
  family: string;
  skillId: string;
  selector: string;
  path: string;
}>;

type JsonLinkResult = Readonly<{
  selector: string;
  status: LinkResult["status"];
  destinationPath: string;
  sourcePath: string;
}>;

type JsonInstallStatusResult = Readonly<{
  selector: string;
  status: SkillInstallStatusResult["status"];
  destinationPath: string;
  sourcePath: string;
  existingTargetPath: string | null;
  detail: string;
}>;

type JsonPackageResult = Readonly<{
  selector: string;
  archivePath: string;
}>;

type JsonHostHarness = Readonly<{
  harnessId: string;
  selector: string;
  path: string;
}>;

type JsonHostHarnessPackageResult = Readonly<{
  selector: string;
  archivePath: string;
}>;

type JsonHostHarnessInitResult = Readonly<{
  selector: string;
  hostRoot: string;
}>;

type InstallScope = "repo-local" | "global";
type InstallStatusScope = InstallScope | "all";
type InstallHost = "agents" | "codex" | "claude" | "custom";

type InstallTarget = Readonly<{
  host: InstallHost;
  scope: "repo-local" | "global" | "custom";
  consumerRepoRoot: string | null;
  destDir: string;
}>;

function printHelp(): void {
  console.log(`bagakit skill

Commands:
  list [--root <repo-root>] [--selector <selector>] [--json]
  install [--selector <selector>] [--scope <repo-local|global>] [--repo <dir>] [--root <repo-root>] [--force] [--json]
  install-status [--selector <selector>] [--scope <repo-local|global|all>] [--repo <dir>] [--dest <dir>] [--root <repo-root>] [--strict] [--json]
  link --selector <selector> [--root <repo-root>] [--dest <dir>] [--force] [--json]
  distribute-package [--root <repo-root>] [--selector <selector>] [--dist <dir>] [--no-clean] [--json]
  host-harness-list [--root <repo-root>] [--selector <harness-id|all>] [--json]
  host-harness-init --selector <harness-id> --repo <host-root> [--root <repo-root>] [--force] [--json]
  host-harness-distribute-package [--root <repo-root>] [--selector <harness-id|all>] [--dist <dir>] [--no-clean] [--json]

Selectors:
  all                  select every installable skill source
  <family>             select all installable skill sources in that family
  <family>/<skill-id>  select one exact installable skill source
  <skill-id>           select one installable skill source; skill ids are globally unique across families

Defaults:
  install --scope repo-local   <cwd>/.codex/skills and <cwd>/.claude/skills
  install --scope global       $AGENTS_HOME/skills or ~/.agents/skills, plus $CLAUDE_CONFIG_DIR/skills or ~/.claude/skills
  install-status --scope all   checks Codex, Agent, and Claude install roots
  --dest  $AGENTS_HOME/skills or ~/.agents/skills
  --dist  dist/skill-packages
  host-harness-distribute-package --dist  dist/host-harnesses

Notes:
  - An installable skill source must live at skills/<family>/<skill-id>/ with SKILL.md.
  - install is the preferred distribution entrypoint; each scope includes its Claude pickup directory by default.
  - install with no selector, or selector "all", installs every discovered installable skill source.
  - install-status reports installed, missing, stale, or conflict by comparing discovered sources with flat install roots.
  - install and link refresh stale symlinks that still point to this repo's previous family path for the same skill id.
  - --force may replace a foreign symlink, but it never removes a regular file or directory.
  - link is the low-level projection primitive when you need an explicit destination path.
  - Relative --dest and --dist paths resolve against --root.
  - list, install, install-status, link, and distribute-package discover skills directly from the directory protocol.
  - distribute-package with no selector, or selector "all", packages every discovered installable skill source.
  - No registry or delivery-profile metadata is consulted by this command surface.
  - Packaging writes family-scoped archives to avoid filename collisions.
  - Host harness sources live flat at host-harnesses/<harness-id>/.
  - host-harness-init materializes a dedicated host root from that source unit.

Internal-only:
  check-layout [--root <repo-root>] [--json]`);
}

function jsonSkill(skill: SkillSource): JsonSkill {
  return {
    family: skill.family,
    skillId: skill.skillId,
    selector: skill.selector,
    path: skill.relativeDir,
  };
}

function jsonLinkResult(result: LinkResult): JsonLinkResult {
  return {
    selector: result.skill.selector,
    status: result.status,
    destinationPath: result.destinationPath,
    sourcePath: result.sourcePath,
  };
}

function jsonInstallStatusResult(repoRoot: string, result: SkillInstallStatusResult): JsonInstallStatusResult {
  return {
    selector: result.skill.selector,
    status: result.status,
    destinationPath: displayPath(process.cwd(), result.destinationPath),
    sourcePath: displayPath(repoRoot, result.sourcePath),
    existingTargetPath: result.existingTargetPath ? displayPath(process.cwd(), result.existingTargetPath) : null,
    detail: result.detail,
  };
}

function jsonPackageResult(result: PackageResult): JsonPackageResult {
  return {
    selector: result.skill.selector,
    archivePath: result.archivePath,
  };
}

function jsonHostHarness(harness: HostHarnessSource): JsonHostHarness {
  return {
    harnessId: harness.harnessId,
    selector: harness.selector,
    path: harness.relativeDir,
  };
}

function jsonHostHarnessPackageResult(result: HostHarnessPackageResult): JsonHostHarnessPackageResult {
  return {
    selector: result.harness.selector,
    archivePath: result.archivePath,
  };
}

function jsonHostHarnessInitResult(repoRoot: string, result: HostHarnessInitResult): JsonHostHarnessInitResult {
  return {
    selector: result.harness.selector,
    hostRoot: displayPath(repoRoot, result.hostRoot),
  };
}

function printSkills(skills: SkillSource[]): void {
  for (const skill of skills) {
    console.log(`${skill.selector}\t${skill.relativeDir}`);
  }
}

function printResolution(resolution: SkillResolution): void {
  console.log(`# ${resolution.kind}: ${resolution.selector}`);
  printSkills(resolution.skills);
}

function printLinkResults(results: LinkResult[]): void {
  for (const result of results) {
    console.log(`${result.status}\t${result.skill.selector}\t${result.destinationPath} -> ${result.sourcePath}`);
  }
}

function printInstallStatusResults(repoRoot: string, results: SkillInstallStatusResult[]): void {
  for (const result of results) {
    const destinationPath = displayPath(process.cwd(), result.destinationPath);
    const sourcePath = displayPath(repoRoot, result.sourcePath);
    const targetSuffix = result.existingTargetPath
      ? `\tcurrent=${displayPath(process.cwd(), result.existingTargetPath)}`
      : "";
    console.log(`${result.status}\t${result.skill.selector}\t${destinationPath} -> ${sourcePath}${targetSuffix}`);
  }
}

function printPackageResults(results: PackageResult[]): void {
  for (const result of results) {
    console.log(`packaged\t${result.skill.selector}\t${result.archivePath}`);
  }
}

function printHostHarnesses(harnesses: HostHarnessSource[]): void {
  for (const harness of harnesses) {
    console.log(`${harness.selector}\t${harness.relativeDir}`);
  }
}

function printHostHarnessResolution(resolution: HostHarnessResolution): void {
  console.log(`# ${resolution.kind}: ${resolution.selector}`);
  printHostHarnesses(resolution.harnesses);
}

function printHostHarnessPackageResults(results: HostHarnessPackageResult[]): void {
  for (const result of results) {
    console.log(`packaged\t${result.harness.selector}\t${result.archivePath}`);
  }
}

function resolveRepoRoot(rawRoot: string): string {
  return resolvePathFrom(process.cwd(), rawRoot);
}

function commonOptions() {
  return {
    root: { type: "string" as const, default: defaultRepoRoot },
    json: { type: "boolean" as const, default: false },
  };
}

function resolveSelection(repoRoot: string, selector: string): SkillResolution {
  return resolveSkillSelector(loadSkillInventory(repoRoot), selector);
}

function resolvePackageSelection(inventory: ReturnType<typeof loadSkillInventory>, rawSelector?: string): SkillSource[] {
  const resolution = rawSelector ? resolveSkillSelector(inventory, rawSelector) : null;
  return resolution ? resolution.skills : inventory.skills;
}

function resolveHostHarnessSelection(
  inventory: ReturnType<typeof loadHostHarnessInventory>,
  rawSelector?: string,
): HostHarnessSource[] {
  const resolution = rawSelector ? resolveHostHarnessSelector(inventory, rawSelector) : null;
  return resolution ? resolution.harnesses : inventory.harnesses;
}

function cmdList(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
    },
    strict: true,
    allowPositionals: false,
  });
  const repoRoot = resolveRepoRoot(values.root);
  const skills = values.selector ? resolveSelection(repoRoot, values.selector).skills : loadSkillInventory(repoRoot).skills;
  if (values.json) {
    console.log(JSON.stringify(skills.map(jsonSkill), null, 2));
    return 0;
  }

  printSkills(skills);
  return 0;
}

function cmdCheckLayout(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: commonOptions(),
    strict: true,
    allowPositionals: false,
  });
  const repoRoot = resolveRepoRoot(values.root);
  const issues = checkCanonicalSkillLayout(repoRoot);
  if (values.json) {
    console.log(JSON.stringify({ issues }, null, 2));
  } else if (issues.length === 0) {
    console.log("installable skill layout check passed");
  } else {
    for (const issue of issues) {
      console.error(issue);
    }
  }
  return issues.length === 0 ? 0 : 1;
}

function cmdLink(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
      dest: { type: "string" as const, default: defaultGlobalSkillsDir() },
      force: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.selector) {
    throw new Error("link requires --selector <selector>");
  }

  const repoRoot = resolveRepoRoot(values.root);
  const layoutIssues = checkCanonicalSkillLayout(repoRoot);
  if (layoutIssues.length > 0) {
    throw new Error(`installable skill layout check failed before link:\n${layoutIssues.join("\n")}`);
  }
  const resolution = resolveSelection(repoRoot, values.selector);
  const destDir = resolvePathFrom(repoRoot, values.dest);
  const results = linkSkills(resolution.skills, {
    repoRoot,
    destDir,
    force: values.force,
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          selector: resolution.selector,
          kind: resolution.kind,
          destination: displayPath(repoRoot, destDir),
          results: results.map(jsonLinkResult),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  printLinkResults(results);
  return 0;
}

function parseInstallScope(rawScope: string): InstallScope {
  if (rawScope === "repo-local" || rawScope === "global") {
    return rawScope;
  }
  throw new Error(`invalid install scope: ${rawScope}. expected repo-local or global`);
}

function parseInstallStatusScope(rawScope: string): InstallStatusScope {
  if (rawScope === "all") {
    return "all";
  }
  return parseInstallScope(rawScope);
}

function resolveInstallTargets(scope: InstallScope, rawRepo?: string): InstallTarget[] {
  if (scope === "global") {
    if (rawRepo) {
      throw new Error("--repo is only valid with --scope repo-local");
    }
    return [
      {
        host: "agents",
        scope,
        consumerRepoRoot: null,
        destDir: defaultGlobalSkillsDir(),
      },
      {
        host: "claude",
        scope,
        consumerRepoRoot: null,
        destDir: defaultGlobalClaudeSkillsDir(),
      },
    ];
  }

  const consumerRepoRoot = resolvePathFrom(process.cwd(), rawRepo ?? ".");
  return [
    {
      host: "codex",
      scope,
      consumerRepoRoot,
      destDir: defaultRepoLocalCodexSkillsDir(consumerRepoRoot),
    },
    {
      host: "claude",
      scope,
      consumerRepoRoot,
      destDir: defaultRepoLocalClaudeSkillsDir(consumerRepoRoot),
    },
  ];
}

function resolveInstallStatusTargets(
  repoRoot: string,
  rawScope: string,
  rawRepo?: string,
  rawDest?: string,
): InstallTarget[] {
  if (rawDest) {
    if (rawRepo) {
      throw new Error("--repo is only valid with --scope repo-local or --scope all");
    }
    return [
      {
        host: "custom",
        scope: "custom",
        consumerRepoRoot: null,
        destDir: resolvePathFrom(repoRoot, rawDest),
      },
    ];
  }

  const scope = parseInstallStatusScope(rawScope);
  if (scope === "global") {
    return resolveInstallTargets("global");
  }
  if (scope === "repo-local") {
    return resolveInstallTargets("repo-local", rawRepo);
  }
  return [
    ...resolveInstallTargets("repo-local", rawRepo),
    ...resolveInstallTargets("global"),
  ];
}

function cmdInstall(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
      scope: { type: "string" as const, default: "repo-local" },
      repo: { type: "string" as const },
      force: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const scope = parseInstallScope(values.scope);
  const repoRoot = resolveRepoRoot(values.root);
  const layoutIssues = checkCanonicalSkillLayout(repoRoot);
  if (layoutIssues.length > 0) {
    throw new Error(`installable skill layout check failed before install:\n${layoutIssues.join("\n")}`);
  }

  const inventory = loadSkillInventory(repoRoot);
  const resolution = values.selector
    ? resolveSkillSelector(inventory, values.selector)
    : {
        selector: "all",
        kind: "all" as const,
        skills: inventory.skills,
      };
  const installTargets = resolveInstallTargets(scope, values.repo);
  const linkRuns = linkSkillsToDestinations(resolution.skills, {
    repoRoot,
    destDirs: installTargets.map((target) => target.destDir),
    force: values.force,
  });
  const resultsByDestination = new Map(linkRuns.map((run) => [run.destDir, run.results]));

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          selector: resolution.selector,
          kind: resolution.kind,
          scope,
          repo: installTargets[0]?.consumerRepoRoot
            ? displayPath(process.cwd(), installTargets[0].consumerRepoRoot)
            : null,
          installs: installTargets.map((target) => ({
            host: target.host,
            destination: displayPath(process.cwd(), target.destDir),
            results: (resultsByDestination.get(target.destDir) ?? []).map(jsonLinkResult),
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  for (const target of installTargets) {
    console.log(`install\t${scope}\t${target.host}\t${displayPath(process.cwd(), target.destDir)}`);
    printLinkResults(resultsByDestination.get(target.destDir) ?? []);
  }
  return 0;
}

function cmdInstallStatus(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
      scope: { type: "string" as const, default: "all" },
      repo: { type: "string" as const },
      dest: { type: "string" as const },
      strict: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const repoRoot = resolveRepoRoot(values.root);
  const inventory = loadSkillInventory(repoRoot);
  const resolution = values.selector
    ? resolveSkillSelector(inventory, values.selector)
    : {
        selector: "all",
        kind: "all" as const,
        skills: inventory.skills,
      };
  const targets = resolveInstallStatusTargets(repoRoot, values.scope, values.repo, values.dest);
  const scans = targets.map((target) => ({
    target,
    results: scanSkillInstallStatus(resolution.skills, target.destDir, repoRoot),
  }));
  const ok = scans.every((scan) => scan.results.every((result) => result.status === "installed"));

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          selector: resolution.selector,
          kind: resolution.kind,
          ok,
          scans: scans.map((scan) => ({
            host: scan.target.host,
            scope: scan.target.scope,
            repo: scan.target.consumerRepoRoot ? displayPath(process.cwd(), scan.target.consumerRepoRoot) : null,
            destination: displayPath(process.cwd(), scan.target.destDir),
            results: scan.results.map((result) => jsonInstallStatusResult(repoRoot, result)),
          })),
        },
        null,
        2,
      ),
    );
    return values.strict && !ok ? 1 : 0;
  }

  for (const scan of scans) {
    console.log(
      `install-status\t${scan.target.scope}\t${scan.target.host}\t${displayPath(process.cwd(), scan.target.destDir)}`,
    );
    printInstallStatusResults(repoRoot, scan.results);
  }
  return values.strict && !ok ? 1 : 0;
}

function cmdDistributePackage(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
      dist: { type: "string" as const },
      "no-clean": { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const repoRoot = resolveRepoRoot(values.root);
  const layoutIssues = checkCanonicalSkillLayout(repoRoot);
  if (layoutIssues.length > 0) {
    throw new Error(`installable skill layout check failed before distribute-package:\n${layoutIssues.join("\n")}`);
  }
  const inventory = loadSkillInventory(repoRoot);
  const discoveredSkills = resolvePackageSelection(inventory, values.selector);
  const distDir = values.dist ? resolvePathFrom(repoRoot, values.dist) : defaultDistDir(repoRoot);
  const results = distributePackages(discoveredSkills, {
    repoRoot,
    distDir,
    clean: !values["no-clean"],
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          selector: values.selector ?? null,
          dist: displayPath(repoRoot, distDir),
          clean: !values["no-clean"],
          results: results.map(jsonPackageResult),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  printPackageResults(results);
  return 0;
}

function cmdHostHarnessList(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
    },
    strict: true,
    allowPositionals: false,
  });
  const repoRoot = resolveRepoRoot(values.root);
  const inventory = loadHostHarnessInventory(repoRoot);
  const resolution = values.selector ? resolveHostHarnessSelector(inventory, values.selector) : null;
  const harnesses = resolution ? resolution.harnesses : inventory.harnesses;
  if (values.json) {
    console.log(JSON.stringify(harnesses.map(jsonHostHarness), null, 2));
    return 0;
  }

  if (resolution) {
    printHostHarnessResolution(resolution);
  } else {
    printHostHarnesses(harnesses);
  }
  return 0;
}

function cmdHostHarnessInit(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
      repo: { type: "string" as const },
      force: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.selector) {
    throw new Error("host-harness-init requires --selector <harness-id>");
  }
  if (!values.repo) {
    throw new Error("host-harness-init requires --repo <host-root>");
  }

  const repoRoot = resolveRepoRoot(values.root);
  const resolution = resolveHostHarnessSelector(loadHostHarnessInventory(repoRoot), values.selector);
  if (resolution.harnesses.length !== 1) {
    throw new Error("host-harness-init requires one exact host harness selector");
  }
  const hostRoot = resolvePathFrom(process.cwd(), values.repo);
  const result = initializeHostHarness(resolution.harnesses[0], {
    hostRoot,
    force: values.force,
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          selector: resolution.selector,
          kind: resolution.kind,
          result: jsonHostHarnessInitResult(process.cwd(), result),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`initialized\t${result.harness.selector}\t${displayPath(process.cwd(), result.hostRoot)}`);
  return 0;
}

function cmdHostHarnessDistributePackage(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      selector: { type: "string" as const },
      dist: { type: "string" as const },
      "no-clean": { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const repoRoot = resolveRepoRoot(values.root);
  const inventory = loadHostHarnessInventory(repoRoot);
  const discoveredHarnesses = resolveHostHarnessSelection(inventory, values.selector);
  const distDir = values.dist ? resolvePathFrom(repoRoot, values.dist) : defaultHostHarnessDistDir(repoRoot);
  const results = distributeHostHarnessPackages(discoveredHarnesses, {
    repoRoot,
    distDir,
    clean: !values["no-clean"],
  });

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          selector: values.selector ?? null,
          dist: displayPath(repoRoot, distDir),
          clean: !values["no-clean"],
          results: results.map(jsonHostHarnessPackageResult),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  printHostHarnessPackageResults(results);
  return 0;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "list":
      return cmdList(rest);
    case "install":
      return cmdInstall(rest);
    case "install-status":
      return cmdInstallStatus(rest);
    case "link":
      return cmdLink(rest);
    case "check-layout":
      return cmdCheckLayout(rest);
    case "distribute-package":
      return cmdDistributePackage(rest);
    case "host-harness-list":
      return cmdHostHarnessList(rest);
    case "host-harness-init":
      return cmdHostHarnessInit(rest);
    case "host-harness-distribute-package":
      return cmdHostHarnessDistributePackage(rest);
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`bagakit-skill: ${message}`);
  process.exitCode = 1;
}
