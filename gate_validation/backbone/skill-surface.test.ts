import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadSkillInventory } from "../../scripts/lib/skill/discovery.ts";
import { checkCanonicalSkillLayout } from "../../scripts/lib/skill/check.ts";
import { linkSkills } from "../../scripts/lib/skill/linking.ts";
import { distributePackages } from "../../scripts/lib/skill/packaging.ts";
import { resolveSkillSelector } from "../../scripts/lib/skill/selectors.ts";

const cliEntry = fileURLToPath(new URL("../../scripts/skill.ts", import.meta.url));
const wrapperEntry = fileURLToPath(new URL("../../scripts/skill.sh", import.meta.url));

function makeTempRepo(): string {
  return path.join(os.tmpdir(), `bagakit-skill-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeSkill(root: string, family: string, skillId: string, extraFiles: Record<string, string> = {}): void {
  const skillDir = path.join(root, "skills", family, skillId);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), `# ${skillId}\n`);
  for (const [relativePath, contents] of Object.entries(extraFiles)) {
    const filePath = path.join(skillDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function canonicalPathText(family: string, skillId: string, ...rest: string[]): string {
  return ["skills", family, skillId, ...rest].join("/");
}

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ["-v"], { stdio: "ignore" });
  return !result.error;
}

function runCli(
  args: string[],
  options: Readonly<{
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }> = {},
) {
  return spawnSync(process.execPath, ["--experimental-strip-types", cliEntry, ...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
  });
}

test("resolveSkillSelector honors family precedence and globally unique skill ids", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "alpha", "family-skill");
  writeSkill(repoRoot, "paperwork", "beta");
  writeSkill(repoRoot, "human-improvement", "solo");

  try {
    const inventory = loadSkillInventory(repoRoot);
    assert.deepEqual(
      inventory.skills.map((skill) => skill.selector),
      [
        "alpha/family-skill",
        "harness/alpha",
        "human-improvement/solo",
        "paperwork/beta",
      ],
    );

    const familyResolution = resolveSkillSelector(inventory, "alpha");
    assert.equal(familyResolution.kind, "family");
    assert.deepEqual(
      familyResolution.skills.map((skill) => skill.selector),
      ["alpha/family-skill"],
    );

    const exactResolution = resolveSkillSelector(inventory, "harness/alpha");
    assert.equal(exactResolution.kind, "qualified");
    assert.deepEqual(
      exactResolution.skills.map((skill) => skill.selector),
      ["harness/alpha"],
    );

    const uniqueResolution = resolveSkillSelector(inventory, "solo");
    assert.equal(uniqueResolution.kind, "skill-id");
    assert.deepEqual(
      uniqueResolution.skills.map((skill) => skill.selector),
      ["human-improvement/solo"],
    );

    const allResolution = resolveSkillSelector(inventory, "all");
    assert.equal(allResolution.kind, "all");
    assert.equal(allResolution.skills.length, inventory.skills.length);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("loadSkillInventory rejects duplicate skill ids across families", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "alpha");

  try {
    assert.throws(
      () => loadSkillInventory(repoRoot),
      /skill id must be globally unique across families: alpha/,
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("loadSkillInventory rejects symlinked skill roots", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  mkdirSync(path.join(repoRoot, "skills", "harness"), { recursive: true });
  writeSkill(repoRoot, "paperwork", "beta");
  symlinkSync(
    path.join(repoRoot, "skills", "paperwork", "beta"),
    path.join(repoRoot, "skills", "harness", "alpha"),
    "dir",
  );

  try {
    assert.throws(
      () => loadSkillInventory(repoRoot),
      (error) => {
        assert.ok(String(error).includes("skill source root must not be a symlink"));
        return true;
      },
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("loadSkillInventory rejects flat legacy installable roots", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills", "legacy-flat"), { recursive: true });
  writeFileSync(path.join(repoRoot, "skills", "legacy-flat", "SKILL.md"), "# legacy-flat\n");

  try {
    assert.throws(
      () => loadSkillInventory(repoRoot),
      (error) => {
        assert.ok(String(error).includes("flat installable skill root is forbidden"));
        return true;
      },
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("skill wrapper honors an explicit repository root", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");

  try {
    const result = spawnSync("bash", [wrapperEntry, "list", "--root", repoRoot, "--json"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as Array<{ selector: string }>;
    assert.deepEqual(payload.map((entry) => entry.selector), ["harness/alpha"]);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("linkSkills creates symlinks, preserves unchanged links, and respects existing path conflicts", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "human-improvement", "solo");

  try {
    const inventory = loadSkillInventory(repoRoot);
    const destDir = path.join(repoRoot, ".linked-skills");
    const solo = resolveSkillSelector(inventory, "solo").skills;

    const firstRun = linkSkills(solo, {
      repoRoot,
      destDir,
      force: false,
    });
    assert.equal(firstRun.length, 1);
    assert.equal(firstRun[0]?.status, "linked");
    assert.equal(readlinkSync(path.join(destDir, "solo")), path.join(repoRoot, "skills", "human-improvement", "solo"));

    const secondRun = linkSkills(solo, {
      repoRoot,
      destDir,
      force: false,
    });
    assert.equal(secondRun[0]?.status, "unchanged");

    const alpha = resolveSkillSelector(inventory, "harness/alpha").skills[0];
    assert.ok(alpha);
    writeFileSync(path.join(destDir, "alpha"), "occupied");
    assert.throws(
      () =>
        linkSkills([alpha], {
          repoRoot,
          destDir,
          force: false,
        }),
      new RegExp("is not a symbolic link; refusing to replace it"),
    );

    assert.throws(
      () =>
        linkSkills([alpha], {
          repoRoot,
          destDir,
          force: true,
        }),
      new RegExp("is not a symbolic link; refusing to replace it"),
    );
    assert.equal(readFileSync(path.join(destDir, "alpha"), "utf8"), "occupied");

    rmSync(path.join(destDir, "alpha"));
    const foreignTarget = path.join(repoRoot, "foreign-alpha");
    mkdirSync(foreignTarget);
    symlinkSync(foreignTarget, path.join(destDir, "alpha"), "dir");
    const forcedRun = linkSkills([alpha], {
      repoRoot,
      destDir,
      force: true,
    });
    assert.equal(forcedRun[0]?.status, "linked");
    assert.equal(readlinkSync(path.join(destDir, "alpha")), path.join(repoRoot, "skills", "harness", "alpha"));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("install resolves repo-local scope from the current working directory", () => {
  const repoRoot = makeTempRepo();
  const consumerRepo = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  mkdirSync(consumerRepo, { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "beta");

  try {
    const result = runCli(["install", "--root", repoRoot, "--selector", "harness", "--scope", "repo-local"], {
      cwd: consumerRepo,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readlinkSync(path.join(consumerRepo, ".codex", "skills", "alpha")),
      path.join(repoRoot, "skills", "harness", "alpha"),
    );
    assert.equal(
      readlinkSync(path.join(consumerRepo, ".claude", "skills", "alpha")),
      path.join(repoRoot, "skills", "harness", "alpha"),
    );
    assert.equal(existsSync(path.join(consumerRepo, ".codex", "skills", "beta")), false);
    assert.equal(existsSync(path.join(consumerRepo, ".claude", "skills", "beta")), false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(consumerRepo, { recursive: true, force: true });
  }
});

test("install with no selector or scope installs every skill into the default Codex and Claude roots", () => {
  const repoRoot = makeTempRepo();
  const consumerRepo = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  mkdirSync(consumerRepo, { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "beta");

  try {
    const result = runCli(["install", "--root", repoRoot], {
      cwd: consumerRepo,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readlinkSync(path.join(consumerRepo, ".codex", "skills", "alpha")),
      path.join(repoRoot, "skills", "harness", "alpha"),
    );
    assert.equal(
      readlinkSync(path.join(consumerRepo, ".codex", "skills", "beta")),
      path.join(repoRoot, "skills", "paperwork", "beta"),
    );
    assert.equal(
      readlinkSync(path.join(consumerRepo, ".claude", "skills", "alpha")),
      path.join(repoRoot, "skills", "harness", "alpha"),
    );
    assert.equal(
      readlinkSync(path.join(consumerRepo, ".claude", "skills", "beta")),
      path.join(repoRoot, "skills", "paperwork", "beta"),
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(consumerRepo, { recursive: true, force: true });
  }
});

test("install resolves explicit repo-local targets and global scope", () => {
  const repoRoot = makeTempRepo();
  const consumerRepo = makeTempRepo();
  const anotherRepo = makeTempRepo();
  const agentsHome = makeTempRepo();
  const claudeConfigDir = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  mkdirSync(consumerRepo, { recursive: true });
  mkdirSync(anotherRepo, { recursive: true });
  mkdirSync(agentsHome, { recursive: true });
  mkdirSync(claudeConfigDir, { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "beta");

  try {
    const explicitRepoRun = runCli(
      ["install", "--root", repoRoot, "--selector", "beta", "--scope", "repo-local", "--repo", anotherRepo],
      { cwd: consumerRepo },
    );
    assert.equal(explicitRepoRun.status, 0, explicitRepoRun.stderr);
    assert.equal(
      readlinkSync(path.join(anotherRepo, ".codex", "skills", "beta")),
      path.join(repoRoot, "skills", "paperwork", "beta"),
    );
    assert.equal(
      readlinkSync(path.join(anotherRepo, ".claude", "skills", "beta")),
      path.join(repoRoot, "skills", "paperwork", "beta"),
    );

    const globalRun = runCli(
      ["install", "--root", repoRoot, "--selector", "harness/alpha", "--scope", "global", "--json"],
      {
        cwd: consumerRepo,
        env: {
          ...process.env,
          AGENTS_HOME: agentsHome,
          CLAUDE_CONFIG_DIR: claudeConfigDir,
        },
      },
    );
    assert.equal(globalRun.status, 0, globalRun.stderr);
    const globalInstall = JSON.parse(globalRun.stdout);
    assert.deepEqual(
      globalInstall.installs.map((install: { host: string }) => install.host),
      ["agents", "claude"],
    );
    assert.equal(readlinkSync(path.join(agentsHome, "skills", "alpha")), path.join(repoRoot, "skills", "harness", "alpha"));
    assert.equal(
      readlinkSync(path.join(claudeConfigDir, "skills", "alpha")),
      path.join(repoRoot, "skills", "harness", "alpha"),
    );

    const invalidGlobalRun = runCli(
      ["install", "--root", repoRoot, "--selector", "alpha", "--scope", "global", "--repo", anotherRepo],
      {
        cwd: consumerRepo,
        env: {
          ...process.env,
          AGENTS_HOME: agentsHome,
          CLAUDE_CONFIG_DIR: claudeConfigDir,
        },
      },
    );
    assert.equal(invalidGlobalRun.status, 1);
    assert.ok(invalidGlobalRun.stderr.includes("--repo is only valid with --scope repo-local"));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(consumerRepo, { recursive: true, force: true });
    rmSync(anotherRepo, { recursive: true, force: true });
    rmSync(agentsHome, { recursive: true, force: true });
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("multi-target install reports conflicts before writing any destination", () => {
  const repoRoot = makeTempRepo();
  const consumerRepo = makeTempRepo();
  const agentsHome = makeTempRepo();
  const claudeConfigDir = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  mkdirSync(consumerRepo, { recursive: true });
  mkdirSync(path.join(claudeConfigDir, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeFileSync(path.join(claudeConfigDir, "skills", "alpha"), "occupied");

  try {
    const result = runCli(["install", "--root", repoRoot, "--selector", "alpha", "--scope", "global"], {
      cwd: consumerRepo,
      env: {
        ...process.env,
        AGENTS_HOME: agentsHome,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("is not a symbolic link; refusing to replace it"));
    assert.equal(existsSync(path.join(agentsHome, "skills", "alpha")), false);
    assert.equal(readFileSync(path.join(claudeConfigDir, "skills", "alpha"), "utf8"), "occupied");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(consumerRepo, { recursive: true, force: true });
    rmSync(agentsHome, { recursive: true, force: true });
    rmSync(claudeConfigDir, { recursive: true, force: true });
  }
});

test("install-status compares canonical skill sources with flat install roots", () => {
  const repoRoot = makeTempRepo();
  const consumerRepo = makeTempRepo();
  const agentsHome = makeTempRepo();
  const claudeConfigDir = makeTempRepo();
  const staleTarget = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  mkdirSync(path.join(agentsHome, "skills"), { recursive: true });
  mkdirSync(path.join(claudeConfigDir, "skills"), { recursive: true });
  mkdirSync(consumerRepo, { recursive: true });
  mkdirSync(staleTarget, { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "beta");
  symlinkSync(path.join(repoRoot, "skills", "harness", "alpha"), path.join(agentsHome, "skills", "alpha"), "dir");
  symlinkSync(
    path.join(repoRoot, "skills", "harness", "alpha"),
    path.join(claudeConfigDir, "skills", "alpha"),
    "dir",
  );
  symlinkSync(staleTarget, path.join(agentsHome, "skills", "beta"), "dir");

  try {
    const globalRun = runCli(["install-status", "--root", repoRoot, "--scope", "global", "--json"], {
      cwd: consumerRepo,
      env: {
        ...process.env,
        AGENTS_HOME: agentsHome,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    assert.equal(globalRun.status, 0, globalRun.stderr);
    const globalStatus = JSON.parse(globalRun.stdout);
    const globalScans = Object.fromEntries(
      globalStatus.scans.map((scan: { host: string; results: Array<{ selector: string; status: string }> }) => [
        scan.host,
        Object.fromEntries(scan.results.map((result) => [result.selector, result.status])),
      ]),
    );
    assert.deepEqual(globalScans.agents, {
      "harness/alpha": "installed",
      "paperwork/beta": "stale",
    });
    assert.deepEqual(globalScans.claude, {
      "harness/alpha": "installed",
      "paperwork/beta": "missing",
    });

    const repoLocalRun = runCli(
      ["install-status", "--root", repoRoot, "--scope", "repo-local", "--repo", consumerRepo, "--selector", "alpha", "--json"],
      { cwd: repoRoot },
    );
    assert.equal(repoLocalRun.status, 0, repoLocalRun.stderr);
    const repoLocalStatus = JSON.parse(repoLocalRun.stdout);
    assert.deepEqual(
      repoLocalStatus.scans.map((scan: { host: string; results: Array<{ selector: string; status: string }> }) => ({
        host: scan.host,
        selector: scan.results[0]?.selector,
        status: scan.results[0]?.status,
      })),
      [
        { host: "codex", selector: "harness/alpha", status: "missing" },
        { host: "claude", selector: "harness/alpha", status: "missing" },
      ],
    );

    const strictRun = runCli(["install-status", "--root", repoRoot, "--scope", "global", "--selector", "beta", "--strict"], {
      cwd: consumerRepo,
      env: {
        ...process.env,
        AGENTS_HOME: agentsHome,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
      },
    });
    assert.equal(strictRun.status, 1);
    assert.ok(strictRun.stdout.includes("stale\tpaperwork/beta"));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(consumerRepo, { recursive: true, force: true });
    rmSync(agentsHome, { recursive: true, force: true });
    rmSync(claudeConfigDir, { recursive: true, force: true });
    rmSync(staleTarget, { recursive: true, force: true });
  }
});

test("distributePackages creates family-scoped archives without rewriting payload membership", () => {
  if (!commandAvailable("zip") || !commandAvailable("unzip")) {
    return;
  }

  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha", {
    "nested/notes.txt": "hello\n",
  });

  try {
    const inventory = loadSkillInventory(repoRoot);
    const distDir = path.join(repoRoot, "dist-check");
    writeFileSync(path.join(repoRoot, "dist-check-stale.txt"), "stale");

    const results = distributePackages(inventory.skills, {
      repoRoot,
      distDir,
      clean: true,
    });
    assert.equal(results.length, 1);

    const archivePath = path.join(distDir, "harness", "alpha.skill");
    assert.ok(existsSync(archivePath));

    const listing = spawnSync("unzip", ["-l", archivePath], {
      encoding: "utf8",
    });
    assert.equal(listing.status, 0);
    const output = `${listing.stdout}${listing.stderr}`;
    assert.match(output, /alpha\/SKILL\.md/);
    assert.match(output, /alpha\/nested\/notes\.txt/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("distributePackages preserves internal symlinks in the archive", () => {
  if (!commandAvailable("zip") || !commandAvailable("python3")) {
    return;
  }

  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha", {
    "nested/target.txt": "hello\n",
  });
  symlinkSync("nested/target.txt", path.join(repoRoot, "skills", "harness", "alpha", "link.txt"));

  try {
    const inventory = loadSkillInventory(repoRoot);
    const distDir = path.join(repoRoot, "dist-check");
    distributePackages(inventory.skills, {
      repoRoot,
      distDir,
      clean: true,
    });

    const archivePath = path.join(distDir, "harness", "alpha.skill");
    const probe = spawnSync(
      "python3",
      [
        "-c",
        [
          "import stat, sys, zipfile",
          "zf = zipfile.ZipFile(sys.argv[1])",
          "info = zf.getinfo('alpha/link.txt')",
          "mode = (info.external_attr >> 16) & 0o170000",
          "print('symlink' if mode == stat.S_IFLNK else oct(mode))",
        ].join("; "),
        archivePath,
      ],
      { encoding: "utf8" },
    );
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(probe.stdout.trim(), "symlink");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("distribute-package packages every discovered installable skill source for default and all selectors", () => {
  if (!commandAvailable("zip")) {
    return;
  }

  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "beta");
  writeSkill(repoRoot, "gamemaker", "render");

  try {
    const defaultRun = runCli(["distribute-package", "--root", repoRoot, "--dist", "dist-default"]);
    assert.equal(defaultRun.status, 0, defaultRun.stderr);
    assert.ok(existsSync(path.join(repoRoot, "dist-default", "harness", "alpha.skill")));
    assert.ok(existsSync(path.join(repoRoot, "dist-default", "gamemaker", "render.skill")));
    assert.ok(existsSync(path.join(repoRoot, "dist-default", "paperwork", "beta.skill")));

    const allRun = runCli(["distribute-package", "--root", repoRoot, "--selector", "all", "--dist", "dist-all"]);
    assert.equal(allRun.status, 0, allRun.stderr);
    assert.ok(existsSync(path.join(repoRoot, "dist-all", "harness", "alpha.skill")));
    assert.ok(existsSync(path.join(repoRoot, "dist-all", "gamemaker", "render.skill")));
    assert.ok(existsSync(path.join(repoRoot, "dist-all", "paperwork", "beta.skill")));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("distribute-package resolves explicit selectors directly from the directory protocol", () => {
  if (!commandAvailable("zip")) {
    return;
  }

  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "paperwork", "beta");
  writeSkill(repoRoot, "paperwork", "guide");
  writeSkill(repoRoot, "harness", "alpha");

  try {
    const familyRun = runCli(["distribute-package", "--root", repoRoot, "--selector", "paperwork", "--dist", "dist-family"]);
    assert.equal(familyRun.status, 0, familyRun.stderr);
    assert.ok(existsSync(path.join(repoRoot, "dist-family", "paperwork", "beta.skill")));
    assert.ok(existsSync(path.join(repoRoot, "dist-family", "paperwork", "guide.skill")));
    assert.equal(existsSync(path.join(repoRoot, "dist-family", "harness", "alpha.skill")), false);

    const exactRun = runCli(["distribute-package", "--root", repoRoot, "--selector", "paperwork/beta", "--dist", "dist-exact"]);
    assert.equal(exactRun.status, 0, exactRun.stderr);
    assert.ok(existsSync(path.join(repoRoot, "dist-exact", "paperwork", "beta.skill")));
    assert.equal(existsSync(path.join(repoRoot, "dist-exact", "paperwork", "guide.skill")), false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("distribute-package fails when canonical layout checks fail", () => {
  if (!commandAvailable("zip")) {
    return;
  }

  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha", {
    "SKILL_PAYLOAD.json": "{}",
  });

  try {
    const result = runCli(["distribute-package", "--root", repoRoot, "--selector", "all", "--dist", "dist"]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("installable skill layout check failed before distribute-package"));
    assert.equal(existsSync(path.join(repoRoot, "dist", "harness", "alpha.skill")), false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("distributePackages refuses to clean output outside the repository", () => {
  if (!commandAvailable("zip")) {
    return;
  }

  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");

  try {
    const inventory = loadSkillInventory(repoRoot);
    assert.throws(
      () =>
        distributePackages(inventory.skills, {
          repoRoot,
          distDir: path.resolve(repoRoot, ".."),
          clean: true,
        }),
      (error) => {
        assert.ok(String(error).includes("refusing to clean dist directory outside the repository"));
        return true;
      },
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("checkCanonicalSkillLayout accepts discoverable installable skill dirs directly from the directory protocol", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha");
  writeSkill(repoRoot, "paperwork", "beta");

  try {
    const issues = checkCanonicalSkillLayout(repoRoot);
    assert.equal(issues.length, 0);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("checkCanonicalSkillLayout rejects absolute symlink targets inside installable skill sources", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha", {
    "nested/target.txt": "hello\n",
  });
  symlinkSync(
    path.join(repoRoot, "skills", "harness", "alpha", "nested", "target.txt"),
    path.join(repoRoot, "skills", "harness", "alpha", "link.txt"),
  );

  try {
    const issues = checkCanonicalSkillLayout(repoRoot);
    const symlinkPath = ["installable skill symlink target must be relative:", canonicalPathText("harness", "alpha", "link.txt")].join(" ");
    assert.ok(issues.join("\n").includes(symlinkPath));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("checkCanonicalSkillLayout rejects local noise inside installable skill sources", () => {
  const repoRoot = makeTempRepo();
  mkdirSync(path.join(repoRoot, "skills"), { recursive: true });
  writeSkill(repoRoot, "harness", "alpha", {
    ".DS_Store": "noise",
    "__pycache__/module.pyc": "noise",
    "nested/temp.pyc": "noise",
  });

  try {
    const issues = checkCanonicalSkillLayout(repoRoot);
    assert.ok(issues.join("\n").includes("installable skill must not contain local noise"));
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
