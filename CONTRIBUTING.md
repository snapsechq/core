# Contributing to SnapSec Core (`@snapsechq/core`)

Thank you for contributing to SnapSec Core! This repository provides centralized authentication, authorization, RabbitMQ messaging, and cloud integration utilities across all SnapSec backend microservices.

For the complete architectural guide, refer to the [Setup & Usage Guide](./docs/setup-and-usage/0-table-of-contents.md) and the comprehensive [Contributing & Adding Packages Guide](./docs/setup-and-usage/5-contributing.md).

---

## Quickstart Development Workflow

### 1. Repository Architecture
All runtime code is housed in `src/` (published to GitHub Packages) and tested via Vitest in `test/`:
- `src/<module>/`: Module implementation (ESM `index.js` and CommonJS `index.cjs`).
- `test/<module>.test.js`: Vitest test suites.
- `test/exports.test.js`: Validates root package exports across ESM and CommonJS.

### 2. Running Tests
Always ensure all unit tests pass before committing or opening a PR:
```bash
npm test
# or in interactive watch mode
npm run test:watch
```

### 3. Adding a New Feature or Module
1. **Implement in `src/`**: Add your module files to `src/<module>/` with dual ESM and CommonJS support.
2. **Register Subpath in `package.json`**: Add the module export under `"exports"`:
   ```json
   "./<new-module>": {
     "import": "./src/<new-module>/index.js",
     "require": "./src/<new-module>/index.cjs"
   }
   ```
3. **Write Unit Tests**: Add `test/<new-module>.test.js` and update `test/exports.test.js`.
4. **Verify Locally**: Test in a downstream microservice using a temporary `"@snapsechq/core": "file:../core"` reference in `package.json`. *(Always revert `file:` references before pushing!)*

### 4. Versioning and Releases
Releases are automated via GitHub Actions when semantic version tags are pushed:
```bash
# For bug fixes
npm version patch

# For new backwards-compatible features
npm version minor

# Push commit and release tag to trigger CI/CD publish
git push origin master --follow-tags
```

---

## Detailed Documentation
- [5. Contributing & Adding Packages Guide](./docs/setup-and-usage/5-contributing.md)
- [4. Versioning & Publishing Workflow](./docs/setup-and-usage/4-versioning-and-publishing.md)
- [3. Installation & Troubleshooting Guide](./docs/setup-and-usage/3-installation-and-troubleshooting.md)

