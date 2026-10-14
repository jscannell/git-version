import { execFileSync } from "node:child_process";
import { compareCore, formatSemVer, parseSemVer, type SemVer } from "./semver.js";

const BASE_VERSION: SemVer = { major: 0, minor: 0, patch: 0, prerelease: [] };
const DEV_BRANCH_SUFFIX = "SNAPSHOT";

export interface GitVersionOptions {
  devBranch: string;
  releaseBranch: string;
  minorIdentifier: string;
  majorIdentifier: string;
  folder?: string;
  prefix?: string;
  hashPrefix?: string;
  logPaths?: string[];
  skipPrerelease?: boolean;
}

interface Identifier {
  pattern: string;
  isRegex: boolean;
}

function parseIdentifier(raw: string): Identifier {
  const m = /\/(.*)\//.exec(raw);
  return m ? { pattern: m[1], isRegex: true } : { pattern: raw, isRegex: false };
}

export class Git {
  private readonly devBranch: string;
  private readonly releaseBranch: string;
  private readonly major: Identifier;
  private readonly minor: Identifier;
  private readonly folder: string;
  private readonly prefix: string;
  private readonly hashPrefix: string;
  private readonly logPaths: string[];
  private readonly skipPrerelease: boolean;

  constructor(options: GitVersionOptions) {
    this.devBranch = options.devBranch;
    this.releaseBranch = options.releaseBranch;
    this.major = parseIdentifier(options.majorIdentifier);
    this.minor = parseIdentifier(options.minorIdentifier);
    this.folder = options.folder ?? process.cwd();
    this.prefix = options.prefix ?? "";
    this.hashPrefix = options.hashPrefix ?? "g";
    this.logPaths = options.logPaths ?? [];
    this.skipPrerelease = options.skipPrerelease ?? false;
  }

  private exec(...args: string[]): string[] {
    try {
      const out = execFileSync("git", args, {
        cwd: this.folder,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 1024 * 1024 * 1024,
      });
      return out.split("\n").filter((line) => line !== "");
    } catch {
      throw new Error(`[ERROR] Command git ${args.join(" ")} failed.`);
    }
  }

  private firstLine(...args: string[]): string {
    const line = this.exec(...args)[0];
    if (line === undefined) throw new Error(`[ERROR] Command git ${args.join(" ")} produced no output.`);
    return line;
  }

  private addPrefix(version: string): string {
    return `${this.prefix}${version}`;
  }

  private stripPrefix(version: string): string | null {
    return version.startsWith(this.prefix) ? version.slice(this.prefix.length) : null;
  }

  private currentBranchOrTag(): string {
    try {
      return this.firstLine("symbolic-ref", "--short", "HEAD");
    } catch {
      return this.firstLine("describe", "--tags");
    }
  }

  private shortSha(): string {
    return `${this.hashPrefix}${this.firstLine("rev-parse", "--short", "--verify", "HEAD").trim()}`;
  }

  private commitsDistance(tag: string | null): number {
    try {
      const range = tag === null ? ["HEAD"] : ["HEAD", `^${tag}`];
      return Number(this.firstLine("rev-list", "--count", ...range));
    } catch {
      return 0;
    }
  }

  private commitsSince(tag: string | null): string[] {
    try {
      if (tag !== null && this.exec("tag", "-l", tag).length > 0) {
        const lastCommit = this.firstLine("show-ref", "-s", tag);
        const paths = this.logPaths.length ? ["--", ...this.logPaths] : [];
        return this.exec("log", "--pretty=%B", `${lastCommit}..HEAD`, ...paths);
      }
      return this.exec("log", "--pretty=%B");
    } catch {
      return [];
    }
  }

  private previousTagAndVersion(): { tag: string | null; version: SemVer } {
    const branchTags = this.exec("tag", "--merged", this.currentBranchOrTag());

    let version = BASE_VERSION;
    let tag: string | null = null;

    for (const candidate of branchTags) {
      const withoutPrefix = this.stripPrefix(candidate);
      if (withoutPrefix === null) continue;
      const parsed = parseSemVer(withoutPrefix);
      if (parsed === null || parsed.prerelease.length > 0) continue;
      if (compareCore(version, parsed) < 0) {
        version = parsed;
        tag = candidate;
      }
    }
    return { tag, version };
  }

  getPreviousVersion(): string {
    const { tag, version } = this.previousTagAndVersion();
    return tag ?? this.addPrefix(formatSemVer(version));
  }

  getNewVersion(): string {
    const { tag, version: previous } = this.previousTagAndVersion();
    let { major, minor } = previous;
    let patch = previous.patch + 1;

    const commits = this.commitsSince(tag).map((c) => c.toLowerCase());

    const majorPattern = new RegExp(`^${this.major.pattern}`);
    const minorPattern = this.minor.isRegex ? new RegExp(this.minor.pattern) : null;

    if (commits.some((c) => majorPattern.test(c))) {
      major += 1;
      minor = 0;
      patch = 0;
    } else if (
      commits.some((c) => (minorPattern ? minorPattern.test(c) : c.includes(this.minor.pattern)))
    ) {
      minor += 1;
      patch = 0;
    }

    const version: SemVer = { major, minor, patch, prerelease: [] };

    if (!this.skipPrerelease) {
      const branch = this.currentBranchOrTag();
      if (branch === this.devBranch) {
        version.prerelease = [DEV_BRANCH_SUFFIX, this.commitsDistance(tag), this.shortSha()];
      } else if (branch !== this.releaseBranch) {
        const sanitized = branch.toLowerCase().replace(/[^a-zA-Z0-9]/g, "").slice(0, 30);
        version.prerelease = [sanitized, this.commitsDistance(tag), this.shortSha()];
      }
    }

    return this.addPrefix(formatSemVer(version));
  }
}
