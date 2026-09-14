# 2. GitHub Packages & .npmrc Setup

Snapsec Core packages are published to GitHub Packages under the `@snapsechq` organization namespace (`https://npm.pkg.github.com/@snapsechq/*`). 

Even for public packages, GitHub's npm registry requires authentication before allowing clients to download packages.

---

## 1. Generating a GitHub Personal Access Token (PAT)

1. Navigate to GitHub: **Settings** -> **Developer Settings** -> **Personal Access Tokens** -> **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Configure the token:
   - **Note**: `Snapsec Core npm access`
   - **Expiration**: Recommended 90 days or organization standard.
   - **Required Scopes**:
     - `read:packages`: **Mandatory**. Allows downloading `@snapsechq/*` packages into microservices.
     - `write:packages`: **Optional / Maintainers only**. Allows publishing new package versions to GitHub Packages.
4. Click **Generate token** and copy the resulting string (`ghp_...`).

---

## 2. Configuring `.npmrc`

NPM looks for registry and credential mappings in the user's home directory. You must configure this file on your development machine.

### File Locations by Operating System

- **Windows**:
  ```text
  C:\Users\<Your-Username>\.npmrc
  ```
  *(Or run `code $HOME\.npmrc` in PowerShell)*

- **Linux & macOS**:
  ```text
  ~/.npmrc
  ```
  *(Or `/home/<your-username>/.npmrc`)*

### Configuration File Content

Add the following lines to your `.npmrc` file:

```ini
@snapsechq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_YOUR_PERSONAL_ACCESS_TOKEN
```

Replace `ghp_YOUR_PERSONAL_ACCESS_TOKEN` with the token generated in Step 1.

---

## 3. Important Guidelines

- **User-Level Only**: Always keep this configuration in your machine's user directory (`~/.npmrc` or `C:\Users\<Username>\.npmrc`).
- **Never Commit Tokens**: Do not create or commit an `.npmrc` file containing personal tokens inside any project repository.
- **CI/CD Environments**: In GitHub Actions or Docker builds, pass the token dynamically via the `NODE_AUTH_TOKEN` environment variable rather than hardcoding it into configuration files.

---

[⬅️ Previous: 1. Background & Architecture](./1-background-and-architecture.md) | [Next: 3. Installation & Troubleshooting ➡️](./3-installation-and-troubleshooting.md)
