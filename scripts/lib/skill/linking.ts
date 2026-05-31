import { lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";

import type { LinkResult, SkillSource } from "./model.ts";
import { displayPath } from "./paths.ts";

type PlannedAction = "create" | "replace" | "unchanged";
type ReplacementSafety = "automatic" | "force_required" | "blocked";

type ExistingLinkInspection = Readonly<{
  action: PlannedAction;
  replacementSafety: ReplacementSafety;
}>;

type PlannedLink = Readonly<{
  skill: SkillSource;
  linkPath: string;
  action: PlannedAction;
}>;

export type LinkOptions = Readonly<{
  repoRoot: string;
  destDir: string;
  force: boolean;
}>;

export type LinkDestinationsOptions = Readonly<{
  repoRoot: string;
  destDirs: string[];
  force: boolean;
}>;

export type LinkDestinationResult = Readonly<{
  destDir: string;
  results: LinkResult[];
}>;

function destinationCollisionError(skills: SkillSource[]): Error {
  const grouped = new Map<string, string[]>();
  for (const skill of skills) {
    const selectors = grouped.get(skill.skillId);
    if (selectors) {
      selectors.push(skill.selector);
      continue;
    }
    grouped.set(skill.skillId, [skill.selector]);
  }

  const collisions = [...grouped.entries()]
    .filter(([, selectors]) => selectors.length > 1)
    .map(([skillId, selectors]) => `- ${skillId}: ${selectors.join(", ")}`);

  return new Error(
    `link selection would collide in the destination directory because these skill ids repeat:\n${collisions.join("\n")}`,
  );
}

function isRepoSkillProjectionTarget(repoRoot: string, candidateTarget: string, skill: SkillSource): boolean {
  const skillsRoot = path.join(path.resolve(repoRoot), "skills");
  const relative = path.relative(skillsRoot, path.resolve(candidateTarget));
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  const parts = relative.split(path.sep);
  return parts.length === 2 && parts[0] !== "" && parts[1] === skill.skillId;
}

function inspectExistingLink(
  linkPath: string,
  targetPath: string,
  repoRoot: string,
  skill: SkillSource,
): ExistingLinkInspection {
  try {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const rawTarget = readlinkSync(linkPath);
      const resolvedTarget = path.resolve(path.dirname(linkPath), rawTarget);
      const canonicalTarget = realpathSync.native(targetPath);
      try {
        const existingTarget = realpathSync.native(resolvedTarget);
        if (existingTarget === canonicalTarget) {
          return { action: "unchanged", replacementSafety: "automatic" };
        }
      } catch {
        return {
          action: "replace",
          replacementSafety: isRepoSkillProjectionTarget(repoRoot, resolvedTarget, skill)
            ? "automatic"
            : "force_required",
        };
      }

      return {
        action: "replace",
        replacementSafety: isRepoSkillProjectionTarget(repoRoot, resolvedTarget, skill)
          ? "automatic"
          : "force_required",
      };
    }
    return { action: "replace", replacementSafety: "blocked" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { action: "create", replacementSafety: "automatic" };
    }
    throw error;
  }
}

function planLinkOperations(skills: SkillSource[], options: LinkOptions): PlannedLink[] {
  const bySkillId = new Set<string>();
  for (const skill of skills) {
    if (bySkillId.has(skill.skillId)) {
      throw destinationCollisionError(skills);
    }
    bySkillId.add(skill.skillId);
  }

  const plan: PlannedLink[] = [];
  const conflicts: string[] = [];
  for (const skill of skills) {
    const linkPath = path.join(options.destDir, skill.skillId);
    const inspection = inspectExistingLink(linkPath, skill.absoluteDir, options.repoRoot, skill);
    if (inspection.action === "replace" && inspection.replacementSafety === "blocked") {
      conflicts.push(`- ${displayPath(options.repoRoot, linkPath)} is not a symbolic link; refusing to replace it`);
      continue;
    }
    if (inspection.action === "replace" && inspection.replacementSafety === "force_required" && !options.force) {
      conflicts.push(
        `- ${displayPath(options.repoRoot, linkPath)} is a foreign symbolic link; rerun with --force to replace it`,
      );
      continue;
    }
    plan.push({ skill, linkPath, action: inspection.action });
  }

  if (conflicts.length > 0) {
    throw new Error(`link operation has protected path conflicts:\n${conflicts.join("\n")}`);
  }

  return plan;
}

function applyLinkPlan(plan: PlannedLink[], repoRoot: string): LinkResult[] {
  const results: LinkResult[] = [];
  for (const item of plan) {
    if (item.action === "replace") {
      rmSync(item.linkPath, { force: true });
    }
    if (item.action === "create" || item.action === "replace") {
      symlinkSync(item.skill.absoluteDir, item.linkPath, "dir");
    }

    results.push({
      skill: item.skill,
      status: item.action === "unchanged" ? "unchanged" : "linked",
      destinationPath: displayPath(repoRoot, item.linkPath),
      sourcePath: item.skill.relativeDir,
    });
  }

  return results;
}

export function linkSkillsToDestinations(
  skills: SkillSource[],
  options: LinkDestinationsOptions,
): LinkDestinationResult[] {
  const destDirs = [...new Set(options.destDirs.map((destDir) => path.resolve(destDir)))];
  const plannedDestinations = destDirs.map((destDir) => ({
    destDir,
    plan: planLinkOperations(skills, {
      repoRoot: options.repoRoot,
      destDir,
      force: options.force,
    }),
  }));

  return plannedDestinations.map(({ destDir, plan }) => {
    mkdirSync(destDir, { recursive: true });
    return {
      destDir,
      results: applyLinkPlan(plan, options.repoRoot),
    };
  });
}

export function linkSkills(skills: SkillSource[], options: LinkOptions): LinkResult[] {
  return linkSkillsToDestinations(skills, {
    repoRoot: options.repoRoot,
    destDirs: [options.destDir],
    force: options.force,
  })[0]?.results ?? [];
}
