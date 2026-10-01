# QA Portal

[![CI](https://github.com/EbinJiji/cicd-practice/actions/workflows/ci.yml/badge.svg)](https://github.com/EbinJiji/cicd-practice/actions/workflows/ci.yml)

A web portal for running automated QA tests against HTTP APIs and keeping a history of
the results, built and shipped through a full CI/CD pipeline.

**Version 1 (this release):** login, logout, and the Dashboard and History pages. Writing
and running tests comes in the next versions.

## Settings

The portal won't start without these (set them in Render → service → **Environment**):

| Setting | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string (e.g. from Neon). Keep it secret |
| `ADMIN_USERNAME` | Username of the admin account, created on startup |
| `ADMIN_PASSWORD` | Its password, at least 12 characters. Changing it and restarting resets the password |

Passwords are stored as scrypt hashes and sessions as SHA-256 hashes of a random token, so
neither can be read back from the database. Logins are limited to 10 attempts per 15 minutes
per address.

## Developing

    npm install
    npm test        # uses PGlite (Postgres inside Node) unless DATABASE_URL is set
    npm run lint

To run the server you need a Postgres database:

    DATABASE_URL=postgres://... ADMIN_USERNAME=admin ADMIN_PASSWORD=... node src/server.js
    # then open http://localhost:3000

## Pipeline

The pipeline lives in `.github/workflows/ci.yml`:

- **CI:** runs the tests on Node 22 and 24 against a real Postgres server, and ESLint once, for every pull request and
  every push to `main`.
- **CD:** after the tests and lint pass on `main`, builds a Docker image and publishes it to
  `ghcr.io/ebinjiji/cicd-practice` (tags: `latest` and the commit SHA). On pull requests
  the image is only built, to check the Dockerfile still works.
- **Deploy:** on `main`, the exact image just built (by digest) goes to **staging** first, then
  waits for a manual approval before the same image goes to **production**. Approve it from the
  run page (**Review deployments**). Each is a Render service with its own GitHub environment
  holding a `RENDER_DEPLOY_HOOK` secret and a `RENDER_URL` variable. Both deploys go through
  `.github/workflows/deploy.yml`, which polls `$RENDER_URL/health` until it reports the new
  commit SHA, then runs smoke tests (`scripts/smoke.js`) against it: a few real requests that
  check the live site gives the right answers. If they fail on staging, production is never
  offered for approval. Run them yourself with `node scripts/smoke.js <url>`.
  - Staging: _not created yet_
  - Production: _not created yet_
- **Security:** every PR and push to `main` is checked two ways. Trivy (`scan` job in CI) builds
  the image and fails on HIGH or CRITICAL vulnerabilities that have a fix available, so a
  vulnerable image is never published. CodeQL (`codeql.yml`) looks for vulnerable code patterns
  in the JavaScript and the workflow files; findings appear under **Security → Code scanning**.
- **Pinned actions:** every action in the workflows is pinned to a full commit SHA (with the
  version in a comment), because a tag can be moved to different code but a SHA cannot.
  Dependabot updates the SHA and the comment together.
- **Monitoring:** `.github/workflows/monitor.yml` runs the smoke tests against production every
  6 hours. While they fail, it keeps one issue labelled `production-down` open (GitHub emails
  you when it opens) and closes it automatically once they pass again. Run it any time from
  **Actions → Monitor**. It checks the URL in the `PRODUCTION_URL` repository variable and is
  skipped while that is unset. GitHub pauses scheduled workflows after 60 days without repo activity.
- **Updates:** Dependabot (`.github/dependabot.yml`) opens a weekly PR for newer npm packages
  and another for newer GitHub Actions. They go through the same CI as any other PR.
- **Runners** are pinned to `ubuntu-24.04` rather than `ubuntu-latest`, so a new Ubuntu
  release can't change the build environment without a PR.

## Render setup (Blueprint)

`render.yaml` describes both Render services (name, image, plan, region, health check), so
the hosting setup is reviewed in PRs like the code. It is **not linked to Render yet**, so
for now it is documentation; the dashboard is still the source of truth.

To link it: Render → **New → Blueprint** → this repo, branch `main`. On the review screen
both services must show as **updated**, not **created** (created means a name doesn't match
and Render would make duplicates, so cancel). After linking, set the Blueprint's
**Auto Sync** to **No**, so changes are applied only when you click **Manual Sync**.

Releases don't go through this file. CI deploys each release by image digest through the
deploy hooks. A sync redeploys the services from `:latest`, which CI pushes *before*
staging and approval, so don't sync while an unapproved release is waiting.

## Rolling back

If a bad release reaches production, redeploy an earlier one without rebuilding:
**Actions → Rollback → Run workflow**, and enter the commit SHA to go back to (short is fine).
The workflow finds that commit's image (`sha-<short sha>` tag), deploys it to Render, and
waits for `/health` to report that SHA. Like a normal release, it waits for production
approval before deploying. Or from a terminal:

    gh workflow run rollback.yml -f sha=<commit>

A rollback only fixes production. Revert the bad change on `main` too (with a test that
catches it), or the next deploy will ship it again.

Run the published image:

    docker run -p 3000:3000 -e DATABASE_URL=postgres://... -e ADMIN_USERNAME=admin \
      -e ADMIN_PASSWORD=... ghcr.io/ebinjiji/cicd-practice:latest
