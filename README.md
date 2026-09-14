# Snapsec Core (`@snapsechq/*`)

Core shared libraries and security packages for the Snapsec microservice architecture.

## Packages

* **`@snapsechq/authorization`**: Declarative RBAC and Resource-Level Policy engine (`can`, `require`, `hasPermission`).
* **`@snapsechq/authentication`**: Pluggable authentication middleware supporting JWT, API Keys, and Internal Service communication for Express applications.

---

## Development & Testing

This repository is managed using **pnpm workspaces** and tested with **Vitest**.

### Install Dependencies
```bash
pnpm install
```

### Run All Unit Tests
```bash
pnpm test
```

### Run in Watch Mode
```bash
pnpm test:watch
```

---

## Consuming Packages from GitHub Packages

Because this repository publishes to the GitHub Packages registry (`npm.pkg.github.com`), projects consuming these packages need an `.npmrc` file configured:

```ini
@snapsechq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install normally:
```bash
npm install @snapsechq/authentication
npm install @snapsechq/authorization
```

---

## Publishing a Release

Packages are automatically tested and published to GitHub Packages via GitHub Actions when a release tag is pushed:

```bash
# Tag format: <package-name>-v<semver>
git tag authentication-v0.1.0
git push origin authentication-v0.1.0
```
