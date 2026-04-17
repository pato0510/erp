# CI/CD Workflows

## Pipeline: CI (`ci.yml`)

Runs on every push to `main` and `develop`, and on pull requests to `main`.

### Jobs

| Job       | Depends on | What it does                                                          |
| --------- | ---------- | --------------------------------------------------------------------- |
| **lint**  | —          | Runs ESLint on affected projects (includes Nx module boundary checks) |
| **build** | lint       | Builds affected projects (Next.js + NestJS)                           |
| **test**  | lint       | Runs tests on affected projects (passes if no tests exist yet)        |

Build and test run **in parallel** after lint passes. If lint fails, both are skipped.

### Nx Affected

The pipeline uses `nx affected` instead of `run-many` to only lint/build/test
projects that changed since the last successful commit. This keeps CI fast as
the monorepo grows.

The `nrwl/nx-set-shas` action automatically determines the correct base and
head SHAs for the affected comparison.

### Caching

- **npm dependencies**: Cached by `actions/setup-node` using `package-lock.json` as key
- **Nx computation cache**: Used automatically by Nx for lint, build, and test targets

## Branch strategy

| Branch      | Purpose                          | Deploys to |
| ----------- | -------------------------------- | ---------- |
| `main`      | Production-ready code            | Production |
| `develop`   | Integration branch               | Staging    |
| `feature/*` | Feature branches (PR to develop) | —          |

## Running locally before pushing

```bash
# Lint all projects
npm run lint

# Build all projects
npx nx run-many --target=build

# Check formatting
npm run format:check

# Run affected only (faster, compares to develop)
npx nx affected --target=lint
npx nx affected --target=build
npx nx affected --target=test --passWithNoTests
```
