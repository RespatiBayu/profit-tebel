# Development Environment

This project uses a dedicated `development` branch, a dedicated Vercel development project, and a separate Supabase PostgreSQL database for development.

## Branch

The development branch is created from `production`:

```bash
git switch production
git fetch origin
git switch -c development
git push -u origin development
```

After the first push, use `development` for staging/dev changes before promoting to `production`.

## Vercel Development Deployment

The development Vercel project is `profit-tebel-development`. Because Vercel's GitHub App must be installed by a repository admin to connect directly to `RespatiBayu/profit-tebel`, development deployments are automated through GitHub Actions and Vercel CLI instead of direct Vercel Git integration.

The workflow is defined in `.github/workflows/development-vercel.yml`. It runs on every push to `development`, pulls the Vercel Production environment for the dedicated development project, builds the app with `--prod`, and deploys a prebuilt production artifact to the development project.

This still does not deploy to the real production app. The production target is only used inside the separate `profit-tebel-development` Vercel project so the development environment has a stable URL:

```text
https://profit-tebel-development.vercel.app
```

Use these settings:

- Framework preset: Next.js
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: Next.js default

Set these GitHub Actions secrets:

```text
VERCEL_TOKEN=<vercel-access-token>
VERCEL_ORG_ID=<vercel-team-id>
VERCEL_PROJECT_ID=<vercel-project-id>
```

Set these environment variables in the Vercel Production environment of the dedicated development project. They do not need branch scoping when using the CLI workflow, because the workflow itself only runs from `development`:

```env
DATABASE_URL=<supabase-development-postgres-url>
SESSION_COOKIE_NAME=pt_session_dev
SESSION_TTL_DAYS=14
SUPERADMIN_EMAIL=<dev-superadmin-email>
NEXT_PUBLIC_APP_URL=https://profit-tebel-development.vercel.app
IPAYMU_VA=
IPAYMU_API_KEY=
IPAYMU_IS_PRODUCTION=false
ADMIN_EMAILS=<comma-separated-dev-admin-emails>
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_CLARITY_PROJECT_ID=
```

Use a Supabase pooled connection string with SSL enabled for Vercel serverless runtime. Prefer the Supabase pooler URL for both Vercel and GitHub Actions; the direct database host can be IPv6-only in some regions and may fail from hosted CI runners.

## Supabase Development Database

Create a separate Supabase project, for example `profit-tebel-development`. Do not reuse the production database.

Add this GitHub repository secret:

```text
DEVELOPMENT_DATABASE_URL=<supabase-development-pooled-postgres-url>
```

The development database workflow is defined in `.github/workflows/development-db.yml`. It runs on every push to `development` and can also be run manually from GitHub Actions.

The runner script:

- Reads SQL files from `supabase/migrations`.
- Applies them in alphabetic filename order.
- Records applied files in `schema_migrations`.
- Stores a SHA-256 checksum for each file.
- Skips previously applied files with the same checksum.
- Fails if an already-applied migration file is edited.

Migration files are append-only after they have been applied to any shared database. Create a new migration file for follow-up schema changes instead of editing old files.

## Verification

Run locally before pushing:

```bash
npm ci
npm run build
```

After pushing to `development`:

1. Confirm the GitHub Actions migration workflow succeeds.
2. Confirm Vercel updates `https://profit-tebel-development.vercel.app`.
3. Open the development URL and verify the app connects to the Supabase development database.
