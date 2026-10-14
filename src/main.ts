import * as core from "@actions/core";
import { Git } from "./git.js";

async function run(): Promise<void> {
  const git = new Git({
    releaseBranch: core.getInput("release-branch"),
    devBranch: core.getInput("dev-branch"),
    minorIdentifier: core.getInput("minor-identifier"),
    majorIdentifier: core.getInput("major-identifier"),
    skipPrerelease: core.getBooleanInput("skip-prerelease"),
    logPaths: core
      .getInput("log-paths")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    prefix: core.getInput("prefix"),
    hashPrefix: core.getInput("hash-prefix"),
  });

  const previousVersion = git.getPreviousVersion();
  core.setOutput("previous-version", previousVersion);
  core.info(`Previous Version: ${previousVersion}`);

  const version = git.getNewVersion();
  core.setOutput("version", version);
  core.info(`New Version: ${version}`);

  if (core.getBooleanInput("summary")) {
    await core.summary
      .addHeading("Git Version", 2)
      .addRaw(`<code>${version}</code>`, true)
      .write();
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
