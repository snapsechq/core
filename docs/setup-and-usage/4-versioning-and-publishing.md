# 4. Versioning & Publishing Workflow

This document describes how to release new versions of `@snapsechq/core` to GitHub Packages, create semantic release tags, and synchronize downstream microservices.

---

## 1. Release Flow Overview

`@snapsechq/core` is published to GitHub Packages (`npm.pkg.github.com/@snapsechq`).

The GitHub Actions workflow ([`.github/workflows/publish.yml`](../../.github/workflows/publish.yml)) triggers automatically whenever a tag matching `v*.*.*` is pushed to GitHub:
1. Runs all unit tests via `pnpm test`.
2. Publishes the updated package to GitHub Packages via `npm publish`.

Because `npm publish` reads the `version` field from `package.json`, the version in `package.json` must be bumped before pushing the tag.

```text
+----------------------------+
| Edit Code in backend/core  |
+----------------------------+
              |
              v
+----------------------------+
|   Stage & Commit Changes   |
+----------------------------+
              |
              v
+--------------------------------------------------------------+
| npm version patch (bumps package.json & creates vX.Y.Z tag)  |
+--------------------------------------------------------------+
              |
              v
+----------------------------------------+
| git push origin master --follow-tags   |
+----------------------------------------+
              |
              v
+----------------------------------------+
|  GitHub Actions Workflow (publish.yml) |
|  - Runs test suite (pnpm test)         |
|  - Publishes to GitHub Packages        |
+----------------------------------------+
              |
              v
+----------------------------------------+
|  snap pkg update (in microservices)    |
+----------------------------------------+
```

---

## 2. Step-by-Step Release Instructions

Execute the following commands from the root of the core repository (`backend/core`):

### Step 1: Stage and Commit Your Changes
```bash
cd "backend/core"
git add .
git commit -m "<your descriptive commit message>"
```

### Step 2: Bump the Version & Generate the Tag
Use `npm version` to update `package.json` and automatically generate a matching git tag in one step:

```bash
# For bug fixes or backwards-compatible changes (e.g., 0.2.1 -> 0.2.2)
npm version patch

# For backwards-compatible feature additions (e.g., 0.2.1 -> 0.3.0)
npm version minor

# For breaking changes (e.g., 0.2.1 -> 1.0.0)
npm version major
```

`npm version patch` automatically:
- Updates `"version"` in `package.json`.
- Creates a git commit with the new version number as the commit message.
- Creates a lightweight git tag (e.g., `v0.2.2`).

### Step 3: Push Commit and Tag to Remote
Push both the branch commit and the new version tag:

```bash
# Recommended single command (pushes commit + newly created tag):
git push origin master --follow-tags

# Or push separately:
git push origin master
git push origin <tag_name>
```

> **Note on `--follow-tags`:**
> `git push --follow-tags` only pushes annotated tags that are reachable from the commits being pushed, preventing accidental push of unverified local tags.

### Step 4: Verify the Pipeline
1. Open the repository on GitHub and navigate to the **Actions** tab.
2. Confirm that the `CI & Publish to GitHub Packages` workflow completes with green checkmarks.

### Step 5: Update Downstream Microservices
Once the package is published, update the microservices across the platform:

```bash
# Update all services declared in dev-setup
snap pkg update

# Or update a specific service
snap pkg update --service Auth
snap pkg update --service VM
```

---

[⬅️ Previous: 3. Installation & Troubleshooting](./3-installation-and-troubleshooting.md) | [Next: 5. Contributing & Adding Packages ➡️](./5-contributions.md)
