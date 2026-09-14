# Setup and Usage Guide

This guide details how to configure your development environment, authenticate with GitHub Packages, install `@snapsechq/authentication` and `@snapsechq/authorization` into Snapsec microservices, and troubleshoot common dependency issues.

---

## Table of Contents

1. [Background & Architecture](./1-background-and-architecture.md)
   - The problem with duplicate logic across 13–17 microservices.
   - Centralized package architecture and decoupling.
2. [GitHub Packages & .npmrc Setup](./2-github-packages-and-npmrc.md)
   - Personal Access Token (PAT) generation and required scopes.
   - User-level `.npmrc` configuration on Windows and Linux/macOS.
3. [Installation & Troubleshooting](./3-installation-and-troubleshooting.md)
   - Installing packages into microservices.
   - Resolving peer dependency conflicts (`--legacy-peer-deps`).
   - Local development and testing workflow with file references.

---

[⬅️ Back: Main Table of Contents](../0-table-of-contents.md) | [Next: 1. Background & Architecture ➡️](./1-background-and-architecture.md)
