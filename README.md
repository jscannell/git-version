# Git Version

Semver versioning based on the git history and commit messages of your repository. A TypeScript port of [codacy/git-version](https://github.com/codacy/git-version).

The action finds the highest release tag (a plain `MAJOR.MINOR.PATCH` tag, with the optional `prefix`) reachable from the current branch and calculates the next version from the commits made since that tag:

- A commit line matching `major-identifier` bumps the major version.
- Otherwise, a commit line matching `minor-identifier` bumps the minor version.
- Otherwise, the patch version is bumped.
- With no tag, the previous version is `0.0.0`.

By default the identifiers follow the [Conventional Commits](https://www.conventionalcommits.org) standard: a `!` after the type or scope (`feat!:`, `fix(api)!:`) or a `BREAKING CHANGE:` footer is a major change, `feat:` or `feat(scope):` is a minor change, and anything else is a patch.

Unless `skip-prerelease` is `true`, a prerelease part is appended on every branch except the release branch:

| Branch | Version |
| --- | --- |
| `release-branch` | `1.4.0` |
| `dev-branch` | `1.4.0-SNAPSHOT.<commits since tag>.<hash-prefix><short sha>` |
| any other branch | `1.4.0-<branch name>.<commits since tag>.<hash-prefix><short sha>` |

The short SHA is prefixed with `hash-prefix` (default `g`, the `git describe` convention) so the identifier is always alphanumeric. In the other-branch form, the branch name is lowercased, stripped of non-alphanumeric characters and truncated to 30 characters.

## Usage

The action reads the full history and tags, so check out with `fetch-depth: 0`.

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Calculate version
        id: version
        uses: jscannell/git-version@v1
        with:
          release-branch: main
          dev-branch: dev
          prefix: v

      - name: Tag release
        run: |
          git tag ${{ steps.version.outputs.version }}
          git push origin ${{ steps.version.outputs.version }}
```

### Custom commit identifiers

Wrap an identifier in `/` to treat it as a regular expression. Commit messages are lowercased before matching, so write identifiers in lowercase.

```yaml
- uses: jscannell/git-version@v1
  with:
    major-identifier: 'breaking:'
    minor-identifier: 'feature:'
```

### Only count changes in some paths

```yaml
- uses: jscannell/git-version@v1
  with:
    log-paths: services/api,libs/shared
```

## Inputs

| Name | Description | Default |
| --- | --- | --- |
| `release-branch` | The name of the release branch. Versions calculated on it have no prerelease part. | `main` |
| `dev-branch` | The name of the dev branch. Versions calculated on it get a `SNAPSHOT` prerelease part. | `dev` |
| `minor-identifier` | String or regex (wrapped in `/`) identifying a minor release commit. A plain string matches anywhere in a commit message line. | `/^feat(\([^)]*\))?:/` |
| `major-identifier` | String or regex identifying a major release commit. Matched at the start of a commit message line. | `/([a-z]+(\([^)]*\))?!\|breaking[ -]change):/` |
| `skip-prerelease` | When `true`, the prerelease part is never added, so `release-branch` and `dev-branch` are effectively ignored. | `false` |
| `prefix` | Prefix for tags and for the calculated version, for example `v`. Tags without the prefix are ignored. | `''` |
| `hash-prefix` | String placed before the short commit SHA in prerelease versions. The default `g` follows the `git describe` convention and keeps the identifier alphanumeric. | `g` |
| `log-paths` | Comma-separated paths. Only commits touching these paths are considered when looking for major and minor identifiers. | `./` |
| `summary` | Write the calculated version to the job summary. Set to `false` to omit it. | `true` |

## Outputs

| Name | Description |
| --- | --- |
| `version` | The calculated version, including the prefix and any prerelease part. |
| `previous-version` | The latest release tag before calculating a new one, or `<prefix>0.0.0` if there is none. |

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

`dist/index.js` is what the action runs and must be committed, so run `npm run build` after changing anything in `src/`.
