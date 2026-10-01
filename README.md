# CI/CD Starter

[![CI](https://github.com/EbinJiji/cicd-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/EbinJiji/cicd-starter/actions/workflows/ci.yml)

A tiny calculator web service for learning CI/CD with GitHub Actions.

Run tests and lint locally:

    npm install
    npm test
    npm run lint

Run the server locally:

    node src/server.js
    # then open http://localhost:3000/add?a=2&b=3

## Pipeline

The pipeline lives in `.github/workflows/ci.yml`:

- **CI:** runs the tests on Node 20, 22 and 24, and ESLint once, for every pull request and
  every push to `main`.
- **CD:** after the tests and lint pass on `main`, builds a Docker image and publishes it to
  `ghcr.io/ebinjiji/cicd-starter` (tags: `latest` and the commit SHA). On pull requests
  the image is only built, to check the Dockerfile still works.
- **Deploy:** on `main`, the exact image just built (by digest) goes to **staging** first, then
  waits for a manual approval before the same image goes to **production**. Approve it from the
  run page (**Review deployments**). Each is a Render service with its own GitHub environment
  holding a `RENDER_DEPLOY_HOOK` secret and a `RENDER_URL` variable. Both deploys go through
  `.github/workflows/deploy.yml`, which polls `$RENDER_URL/health` until it reports the new
  commit SHA, then runs smoke tests (`scripts/smoke.js`) against it: a few real requests that
  check the live site gives the right answers. If they fail on staging, production is never
  offered for approval. Run them yourself with `node scripts/smoke.js <url>`.
  - Staging: https://cicd-starter-latest-1.onrender.com
  - Production: https://cicd-starter-latest.onrender.com
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
  **Actions → Monitor**. GitHub pauses scheduled workflows after 60 days without repo activity.
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

    docker run -p 3000:3000 ghcr.io/ebinjiji/cicd-starter:latest

## Exercises

1. Push to GitHub and watch the **Actions** tab.
2. Break a test on purpose (e.g. make `add` return `a - b`), push, and watch CI fail. Then fix it.
3. Add a new function (e.g. `power`) with a test.
4. Protect `main`: Settings → Branches → require the CI check to pass before merging.
5. Add a lint step (ESLint) to the workflow.
6. Add a CI status badge to this README.
7. Deploy the published image to a hosting service (e.g. Render or Fly.io).
