import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Git } from "../src/git.js";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-version-"));
  git(dir, "init", "-q", "-b", "master");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "config", "tag.gpgsign", "false");
  return dir;
}

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function commit(dir: string, message: string): void {
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
}

function make(dir: string, extra: Partial<ConstructorParameters<typeof Git>[0]> = {}): Git {
  return new Git({
    folder: dir,
    releaseBranch: "master",
    devBranch: "dev",
    minorIdentifier: String.raw`/^feat(\([^)]*\))?:/`,
    majorIdentifier: String.raw`/([a-z]+(\([^)]*\))?!|breaking[ -]change):/`,
    ...extra,
  });
}

test("untagged release branch starts at 0.0.1", () => {
  const dir = repo();
  commit(dir, "init");
  assert.equal(make(dir).getNewVersion(), "0.0.1");
});

test("patch, minor and major bumps from the latest tag", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "tag", "v1.2.3");
  const g = make(dir, { prefix: "v" });

  commit(dir, "fix: thing");
  assert.equal(g.getNewVersion(), "v1.2.4");
  assert.equal(g.getPreviousVersion(), "v1.2.3");

  commit(dir, "feat: thing");
  assert.equal(g.getNewVersion(), "v1.3.0");

  commit(dir, "feat!: thing");
  assert.equal(g.getNewVersion(), "v2.0.0");
});

test("dev branch prerelease uses a g-prefixed short SHA", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "tag", "1.0.0");
  git(dir, "checkout", "-q", "-b", "dev");
  commit(dir, "work");
  const sha = git(dir, "rev-parse", "--short", "HEAD");
  assert.equal(make(dir).getNewVersion(), `1.0.1-SNAPSHOT.1.g${sha}`);
});

test("feature branch prerelease sanitizes the branch name", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "checkout", "-q", "-b", "Feature/My_Thing");
  const sha = git(dir, "rev-parse", "--short", "HEAD");
  assert.equal(make(dir).getNewVersion(), `0.0.1-featuremything.1.g${sha}`);
});

test("skipPrerelease drops the prerelease part", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "checkout", "-q", "-b", "other");
  assert.equal(make(dir, { skipPrerelease: true }).getNewVersion(), "0.0.1");
});

test("regex minor identifier", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "tag", "1.0.0");
  commit(dir, "add: widget");
  assert.equal(make(dir, { minorIdentifier: "/^(add|feat):/" }).getNewVersion(), "1.1.0");
});

test("hashPrefix replaces the default g", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "checkout", "-q", "-b", "other");
  const sha = git(dir, "rev-parse", "--short", "HEAD");
  assert.equal(make(dir, { hashPrefix: "sha" }).getNewVersion(), `0.0.1-other.1.sha${sha}`);
});

test("conventional commit scopes and breaking change footers", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "tag", "1.0.0");
  const g = make(dir);

  commit(dir, "feat(parser): add thing");
  assert.equal(g.getNewVersion(), "1.1.0");

  commit(dir, "refactor(api)!: drop endpoint");
  assert.equal(g.getNewVersion(), "2.0.0");
});

test("BREAKING CHANGE footer bumps major", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "tag", "1.0.0");
  commit(dir, "fix: thing\n\nBREAKING CHANGE: removed option");
  assert.equal(make(dir).getNewVersion(), "2.0.0");
});

test("fix and chore commits only bump patch", () => {
  const dir = repo();
  commit(dir, "init");
  git(dir, "tag", "1.0.0");
  commit(dir, "fix: a");
  commit(dir, "chore: b");
  commit(dir, "docs: feat: not a feature");
  assert.equal(make(dir).getNewVersion(), "1.0.1");
});
