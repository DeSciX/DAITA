# DeSciX Multi-Environment Deployment & SSL Architecture

## 1. Architecture Overview

This document outlines the deployment pattern for the DeSciX platform, utilizing a "Wildcard Subdomain" strategy across multiple environments served by a single Global External Application Load Balancer (GCLB).

### DNS & Domain Strategy
*   **DNS Provider:** Cloudflare
*   **Root Domains:**
    *   `descix.net` (Production)
    *   `demo.descix.net` (Demo)
    *   `dev.descix.net` (Development/Staging)
    *   `preview.descix.net` (Preview)
*   **Load Balancer:** Single Global External Application Load Balancer (IP: `34.8.134.87`)

### Routing Pattern

#### A. Environment Root (`{env}.descix.net`)
*   **Frontend (PWA):** Served from GCS (Edge Cached) via Backend Bucket. Path `/` → `gs://descix-assets-public/{env}/app/index.html`
*   **Backend (API):** Path `/api/*` → Cloud Run (e.g. `demo-api-backend`)

#### B. App Subdomains (`[app].{env}.descix.net`)
*   **Example:** `https://powch.demo.descix.net`
*   **Frontend (PWA):** Path `/` → `gs://descix-assets-public/{env}/powch/index.html`
*   **Backend (API):** Path `/api/v1/[app]/*` → app-specific Cloud Run (e.g. `powch-demo-backend`)

---

## 2. SSL Certificate Setup (Certificate Manager)

We use **Google Certificate Manager** (not Compute Engine SSL certificates) with **DNS Authorization** for wildcard support and auto-renewal.

### Why Certificate Manager + DNS Authorization?

| Constraint | Load Balancer Authorization | DNS Authorization |
|------------|-----------------------------|--------------------|
| Wildcards | ❌ Not supported | ✅ Required for `*.demo.descix.net` |
| Cloudflare Proxy | ❌ Domain must resolve to LB IP; proxy breaks this | ✅ CNAME challenge works with DNS-only records |
| Setup complexity | Simpler if no proxy | One-time CNAME setup per domain |

### Certificate Scope (Critical)

When creating the certificate in GCP Console or gcloud, **scope must be `DEFAULT`** (or omit for default).

| Scope | Use Case |
|-------|----------|
| `DEFAULT` | **External Application Load Balancers**, Cloud CDN |
| `ALL_REGIONS` | Cross-region **Internal** Application Load Balancers only |
| `EDGE_CACHE` | Media CDN / Media Edge services only |

❌ **`ALL_REGIONS`** certificates cannot be used in Certificate Map entries attached to our external LB. If you see `certificate has invalid scope`, create a new certificate with `DEFAULT` scope.

---

## 3. Cloudflare CNAME Records for ACME Validation

Certificate Manager uses DNS-01 ACME challenges. For each domain (e.g. `demo.descix.net`), you must add a CNAME record.

### DNS-Only (Grey Cloud) Required

**Proxy status must be DNS-only (Grey Cloud)** for `_acme-challenge.*` records. If proxied (Orange Cloud), the CA’s validation requests may not resolve correctly, and provisioning can fail.

| Record Name | Type | Target | Proxy |
|-------------|------|--------|-------|
| `_acme-challenge.descix.net` | CNAME | `{token}.authorize.certificatemanager.goog` | **DNS only** |
| `_acme-challenge.demo.descix.net` | CNAME | `{token}.authorize.certificatemanager.goog` | **DNS only** |
| `_acme-challenge.dev.descix.net` | CNAME | `{token}.authorize.certificatemanager.goog` | **DNS only** |
| `_acme-challenge.preview.descix.net` | CNAME | `{token}.authorize.certificatemanager.goog` | **DNS only** |

The exact target comes from the GCP DNS Authorization. Get it with:

```bash
gcloud certificate-manager dns-authorizations list --project=descix --location=global --format="table(name,domain,dnsResourceRecord.name,dnsResourceRecord.data)"
```

### Common CNAME Misconfigurations

1. **Wrong target:** Record pointed at the domain (e.g. `demo.descix.net`) instead of the GCP token (e.g. `78f4596a-....authorize.certificatemanager.goog`). Results in `CNAME_MISMATCH`.
2. **Proxy enabled:** Orange Cloud can break ACME validation; use Grey Cloud for `_acme-challenge` records.
3. **Apex only:** Wildcards like `*.demo.descix.net` use the same CNAME as `demo.descix.net` (`_acme-challenge.demo.descix.net`). One correct CNAME covers both.

---

## 4. A Records for Traffic (Cloudflare)

The Load Balancer must receive traffic at `{env}.descix.net` and `[app].{env}.descix.net`. DNS A records are required.

### Wildcard Does Not Cover the Apex

A wildcard `*.demo.descix.net` matches subdomains only (e.g. `powch.demo.descix.net`, `foo.demo.descix.net`). It does **not** match the apex `demo.descix.net` itself.

### Required A Records (per environment)

| Record Name | Type | Content | Proxy |
|-------------|------|---------|-------|
| `demo` (or `demo.descix.net`) | A | `34.8.134.87` | Optional |
| `*.demo` (or `*.demo.descix.net`) | A | `34.8.134.87` | Optional |

Repeat for `dev`, `preview`, and prod (`descix.net` apex + `*.descix.net`).

### Verification

```bash
dig demo.descix.net A +short      # Should return 34.8.134.87
dig powch.demo.descix.net A +short # Should return 34.8.134.87
```

---

## 5. Certificate Manager Resources and LB Attachment

Certificate Manager certs are attached via a **Certificate Map**, not directly to the target proxy.

### Resource Flow

```
Certificate (descix-wildcard-cert-default)
    ↓
Certificate Map Entry (descix-wildcard-primary, --set-primary)
    ↓
Certificate Map (descix-wildcard-map)
    ↓
Target HTTPS Proxy (descix-discord-app-lb-target-proxy)
```

### gcloud Commands (One-Time Setup)

```bash
# 1. Create DNS Authorizations (one per domain)
gcloud certificate-manager dns-authorizations create dns-authz-descix-net \
  --project=descix --location=global --domain="descix.net"
gcloud certificate-manager dns-authorizations create dns-authz-demo-descix-net \
  --project=descix --location=global --domain="demo.descix.net"
# Repeat for dev, preview...

# 2. Add CNAME records in Cloudflare (from step 1 describe output)

# 3. Create certificate with DEFAULT scope
gcloud certificate-manager certificates create descix-wildcard-cert-default \
  --project=descix --location=global --scope=DEFAULT \
  --domains="descix.net,*.descix.net,demo.descix.net,*.demo.descix.net,dev.descix.net,*.dev.descix.net,preview.descix.net,*.preview.descix.net" \
  --dns-authorizations="projects/PROJECT_NUMBER/locations/global/dnsAuthorizations/dns-authz-descix-net,..."

# 4. Create Certificate Map and primary entry
gcloud certificate-manager maps create descix-wildcard-map \
  --project=descix --location=global \
  --description="Wildcard cert for descix.net envs"

gcloud certificate-manager maps entries create descix-wildcard-primary \
  --project=descix --location=global --map=descix-wildcard-map \
  --certificates=descix-wildcard-cert-default --set-primary

# 5. Attach map to target proxy
gcloud compute target-https-proxies update descix-discord-app-lb-target-proxy \
  --project=descix --global --certificate-map=descix-wildcard-map
```

### Rollback

To revert to a Compute Engine SSL certificate:

```bash
gcloud compute target-https-proxies update descix-discord-app-lb-target-proxy \
  --project=descix --global --clear-certificate-map
```

Ensure at least one certificate is directly attached (`demo-descix-cert-v2`) before clearing; otherwise the proxy has no certs.

---

## 6. Configuration Challenges Overcome

### C.1 Wildcards Require DNS Authorization

Load Balancer Authorization does not support wildcards. Use DNS Authorization for `*.demo.descix.net`, `*.dev.descix.net`, etc.

### C.2 CNAME Must Point to GCP Token

Initial records pointed `_acme-challenge.demo.descix.net` to `demo.descix.net`. Validation expects the GCP token (e.g. `78f4596a-...authorize.certificatemanager.goog`). Update Cloudflare CNAME targets accordingly.

### C.3 Certificate Scope for External LB

Certificates with `ALL_REGIONS` scope are only for Internal Application Load Balancers. For our external LB and Certificate Map, use `DEFAULT` scope.

### C.4 Certificate Map vs Direct SSL Certificates

Certificate Manager certs are not attached directly to the target proxy. They are added to a Certificate Map, and the map is attached to the proxy. When a map is attached, it overrides directly attached SSL certificates.

### C.5 Cloudflare Proxy vs ACME Validation

`_acme-challenge` records must be DNS-only so the CA can validate via CNAME. Other records (A for `demo.descix.net`, `*.demo.descix.net`) can remain proxied for DDoS and WAF.

### C.6 Apex A Record Required

The wildcard `*.demo.descix.net` does not match `demo.descix.net`. Without an explicit A record for the apex, `demo.descix.net` will not resolve. Add both the apex A record and the wildcard A record.

---

## 7. Verification

```bash
# Certificate status
gcloud certificate-manager certificates describe descix-wildcard-cert-default \
  --project=descix --location=global --format="value(managed.state)"

# DNS CNAMEs
dig _acme-challenge.demo.descix.net CNAME +short

# Target proxy
gcloud compute target-https-proxies describe descix-discord-app-lb-target-proxy \
  --project=descix --global --format="yaml"
```

---

## 8. Alternative: Cloudflare Origin Certificate

If Certificate Manager provisioning is problematic, you can use a Cloudflare Origin Certificate:

1. Cloudflare → SSL/TLS → Origin Server → Create Certificate
2. Hostnames: `*.descix.net`, `descix.net`, `*.demo.descix.net`, etc.
3. GCP → Certificate Manager → Create Self-managed certificate → Paste keys
4. Add to Certificate Map and attach to target proxy
5. Cloudflare SSL mode: Full (Strict)

**Note:** Origin certs are only trusted by Cloudflare. Traffic must go through Cloudflare; direct access to the LB IP will show certificate warnings.
