# PWA App Deployment Guide

Quick reference for deploying DeSciX and mesh apps (main PWA, Powch) to demo/prod.

> **Canonical model:** [`platform-must-know-briefer.md`](../architecture/platform-must-know-briefer.md) §4. Platform LB (daita broker NEG + powch NEG + apex/peer hosts) is provisioned at platform standup via `deploy-backend-env.sh` → `provision-platform-lb.js` (powch NEG after `deploy-service-env.sh powch`). Routine non-core app deploys are site upload + Cloud Run only — **no NEG or mesh routing script.**

## Prerequisites

- `gcloud` CLI authenticated: `gcloud auth application-default login`
- Project set: `gcloud config set project descix`
- Platform env standup complete (`deploy-backend-env.sh` has run for the target env)
- CDN invalidation IAM (once per project): `./DeSciX_Cloud/microservice/admin/scripts/deploy/grant-cdn-invalidator-iam.sh demo` (or `prod` / `preview`)

## Deploy Main PWA (demo.descix.net / daita singleton apex)

```bash
descix --env=demo site upload -a daita -c descix
```

- Build env (GTM, base path, API/Powch URLs) comes from backend `get_site_build_config`
- Site manifest: `DeSciX_Cloud/.descix/manifests/site.json` (`sources[]` + `buildCommand`)
- Uploads to `gs://descix-assets-public/{env}/daita/site/`
- `confirm_site_deploy` sets `index.html` no-cache and invalidates CDN (when `CDN_URL_MAP_NAME` is set on Core CF)
- Apex host rule is already provisioned at platform standup — this command does not mutate the URL map

`deploy-pwa-env.js` is **retired** — it exits with a redirect message.

## Deploy Powch PWA (powch.demo.descix.net)

```bash
# 1. Powch Cloud Run (re-provisions the platform NEG), then its manifest
ECHO_MODE=false bash DeSciX_Cloud/microservice/admin/scripts/deploy/deploy-service-env.sh powch demo
descix --env=demo microservice register -m DeSciX_Powch/microservice/manifest.json -a powch -c powch

# 2. Powch PWA to GCS
descix --env=demo site upload -a powch
```

- Powch builds with base path `/{env}/powch/site/`
- Uploads to `gs://descix-assets-public/{env}/powch/site/`
- Peer host `powch.demo.descix.net` is provisioned at platform standup via `provision-platform-lb.js`

## Full Demo Redeploy (Both Apps)

```bash
# Platform backend + LB (only if infra changed; skip for routine redeploy)
ECHO_MODE=false ./DeSciX_Cloud/microservice/admin/scripts/deploy/prod/deploy-backend-env.sh demo

# Main PWA
descix --env=demo site upload -a daita

# Powch service + PWA
ECHO_MODE=false bash DeSciX_Cloud/microservice/admin/scripts/deploy/deploy-service-env.sh powch demo
descix --env=demo microservice register -m DeSciX_Powch/microservice/manifest.json -a powch -c powch
descix --env=demo site upload -a powch
```

## Environment Variants

| `--env` | Main Host (daita apex) | Powch Host |
|---------|--------------------------|------------|
| `demo` | `demo.descix.net` | `powch.demo.descix.net` |
| `prod` | `descix.net` | `powch.descix.net` |
| `preview` | `preview.descix.net` | — |

## Site manifests

Apps with `{appRoot}/.descix/manifests/site.json` use manifest-driven build + upload:

```json
{
  "buildCommand": "npm run build --prefix site",
  "sources": [{ "path": "site/dist", "include": ["**/*"] }]
}
```

Platform apps **daita** (`DeSciX_Cloud/.descix/manifests/site.json`) and **powch** (`DeSciX_Powch/.descix/manifests/site.json`) ship manifests. **daita** requires `-c descix` until CLI resolves community from Products.

## Verification

| Check | Command / URL |
|-------|---------------|
| Main PWA | `curl -sI https://demo.descix.net/` → 200 |
| Powch host | `curl -sI https://powch.demo.descix.net/` → 200 |
| Main assets | `curl -sI https://demo.descix.net/demo/daita/site/assets/index-*.js` → 200 |
| Powch assets | `curl -sI https://powch.demo.descix.net/demo/powch/site/assets/` → 200 |

## Script Locations

| Script | Purpose |
|--------|---------|
| `deploy-backend-env.sh` | Platform standup: CF + App Engine + `provision-platform-lb.js` + `CDN_URL_MAP_NAME` |
| `provision-platform-lb.js` | Core NEG + apex + platform peer URL map (once per env) |
| `deploy-service-env.sh` | Cloud Run deploy (`ECHO_MODE=false` executes; follow with `descix microservice register`) |
| `grant-cdn-invalidator-iam.sh` | One-time IAM for server-side CDN invalidation in `confirm_site_deploy` |
| `descix site upload` | Canonical PWA deploy (build + GCS + CDN hooks) |
| `descix microservice register` | Manifest register after a Cloud Run deploy (no LB for non-core apps) |

## Custom Domains

**As-built:** Host rules via the GCP URL map: apex `demo.descix.net` (daita singleton), peer hosts `powch.demo.descix.net`, etc. All provisioned at platform standup by `provision-platform-lb.js`, not per-app deploy.

**Future:** Full custom domains (e.g. `app.community.descix.app`) would extend the URL map at platform tier.

## Related

- [deployment-guide.md](deployment-guide.md) – Full deployment flow, backend, infra
- [environment-deployment-runbook.md](environment-deployment-runbook.md) – Canonical step sequence
- [platform-must-know-briefer.md](../architecture/platform-must-know-briefer.md) – Broker-first mesh model
- [ssl-architecture-setup.md](ssl-architecture-setup.md) – DNS, SSL certs
