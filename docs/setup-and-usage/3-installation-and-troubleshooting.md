# 3. Installation & Troubleshooting

## 1. Installing Packages in a Microservice

Once your user-level `.npmrc` is configured with a valid token, navigate to the target microservice folder and install the packages:

```bash
npm install @snapsechq/authentication @snapsechq/authorization
```

Verify that the dependencies appear in the service's `package.json`:

```json
"dependencies": {
  "@snapsechq/authentication": "^0.1.0",
  "@snapsechq/authorization": "^0.1.0"
}
```

---

## 2. Resolving Peer Dependency Conflicts (`--legacy-peer-deps`)

Several existing Snapsec microservices (such as `backend/VM`) run on Mongoose 5 (e.g. `5.13.23`). When installing new packages, npm's strict dependency resolver can fail with `ERESOLVE`:

```text
npm error code ERESOLVE
npm error ERESOLVE could not resolve
npm error
npm error While resolving: express-oas-generator@1.0.48
npm error Found: mongoose@5.13.23
npm error node_modules/mongoose
npm error   mongoose@"^5.13.23" from the root project
npm error
npm error Could not resolve dependency:
npm error peer mongoose@"^6.4.6" from express-oas-generator@1.0.48
npm error Conflicting peer dependency: mongoose@6.13.11
```

### Why This Happens
Third-party documentation packages (like `express-oas-generator`) declare strict peer dependencies on `mongoose@^6`, which clashes with the service's root `mongoose@5.x` requirement.

### How to Resolve
Run `npm install` with the `--legacy-peer-deps` flag:

```bash
npm install @snapsechq/authentication @snapsechq/authorization --legacy-peer-deps
```

The `--legacy-peer-deps` flag tells npm to ignore conflicting peer dependencies (behaving like npm v6) and install the requested packages cleanly.

---

## 3. Local Development & Testing Workflow

When adding features or debugging `@snapsechq/authentication` or `@snapsechq/authorization`, you can test changes locally without publishing intermediate versions to GitHub Packages.

### Step 1: Link Local Packages via File Path
In the microservice's `package.json`, replace the version strings with relative `file:` paths to the local monorepo packages:

```json
{
  "dependencies": {
    "@snapsechq/authentication": "file:../core/packages/authentication",
    "@snapsechq/authorization": "file:../core/packages/authorization"
  }
}
```

### Step 2: Install Local References
Inside the target microservice directory, execute:

```bash
npm install --legacy-peer-deps
```

NPM will symlink the local directory into the microservice's `node_modules`. Any changes made inside `backend/core/packages/` will reflect immediately upon restarting the microservice.

### Step 3: Revert Before Committing
> **CRITICAL WARNING:**
> Local `file:` paths will break CI/CD pipelines, Docker container builds, and teammate environments.
> 
> **Never commit `file:` references to Git.**
> 
> Before committing or opening a pull request:
> 1. Publish the updated core package to GitHub Packages (or create the required release tag).
> 2. Revert the service's `package.json` to the semantic version (e.g., `^0.1.0`).
> 3. Run `npm install --legacy-peer-deps` to re-sync `package-lock.json`.

---

[⬅️ Previous: 2. GitHub Packages & .npmrc Setup](./2-github-packages-and-npmrc.md) | [Next: Authentication ➡️](../authentication/0-table-of-contents.md)
