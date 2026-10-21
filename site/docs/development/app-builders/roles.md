# DeSciX Roles Administration Guide

## Overview

DeSciX uses a hierarchical role system for access control:
- **PLATFORM** roles apply across the entire platform
- **COMMUNITY** roles apply within a specific community
- **APP** roles apply within a specific app

## Role Hierarchy

```
PLATFORM > COMMUNITY > APP
```

Higher-level roles inherit permissions to lower levels. For example, a platform admin can manage all communities and apps.

## Platform Roles

Platform roles are created by the admin bootstrap script and apply system-wide.

### Role Definitions

| Role ID | Name | Permissions | Description |
|---------|------|-------------|-------------|
| `platform_descix_superadmin` | Super Admin | ALL permissions | Full platform access – can perform any operation |
| `platform_descix_admin` | Platform Admin | `PLATFORM_MANAGE_COMMUNITIES`<br>`PLATFORM_MANAGE_APPS`<br>`PLATFORM_MANAGE_ROLES` | Platform management – can create/manage communities, apps, and roles |
| `platform_member` | Platform Member | `AIRDROP_ELIGIBLE` | Basic platform membership – eligible for airdrops |

### Creating Platform Roles

Platform roles are created by the platform operator when an environment is bootstrapped; an app builder never creates them. They are stored in Firestore under `Community/daita/Roles/{roleId}`.

## Community Roles

Community roles are scoped to a specific community and can be created by community owners or platform admins.

### Standard Community Roles

| Role ID Pattern | Name | Permissions | Description |
|-----------------|------|-------------|-------------|
| `community_{id}_owner` | Community Owner | `COMMUNITY_MANAGE_APPS`<br>`COMMUNITY_MANAGE_ROLES`<br>`COMMUNITY_MANAGE_MEMBERS` | Full control over community |
| `community_{id}_admin` | Community Admin | `COMMUNITY_MANAGE_APPS`<br>`COMMUNITY_MANAGE_ROLES` | Can manage apps and roles |
| `community_{id}_member` | Community Member | `COMMUNITY_VIEW` | Basic community access |

## App Roles

App roles are scoped to a specific app within a community.

### Standard App Roles

| Role ID Pattern | Name | Permissions | Description |
|-----------------|------|-------------|-------------|
| `app_{community_id}_{app_id}_owner` | App Owner | `APP_MANAGE_KB`<br>`APP_MANAGE_ROLES` | Full control over app |
| `app_{community_id}_{app_id}_admin` | App Admin | `APP_MANAGE_KB` | Can manage knowledge bases |
| `app_{community_id}_{app_id}_member` | App Member | `APP_VIEW` | Basic app access |

## Permission System

Permissions are checked via `permissionService.js`:

```javascript
import { checkUserPermission } from './permissionService.js';

const authorized = await checkUserPermission(user, PERMISSIONS.PLATFORM_MANAGE_COMMUNITIES);
```

### Permission Hierarchy

1. **Platform Permissions**: Apply system-wide
   - `PLATFORM_MANAGE_COMMUNITIES`
   - `PLATFORM_MANAGE_APPS`
   - `PLATFORM_MANAGE_ROLES`

2. **Community Permissions**: Scoped to community
   - `COMMUNITY_MANAGE_APPS`
   - `COMMUNITY_MANAGE_ROLES`
   - `COMMUNITY_MANAGE_MEMBERS`

3. **App Permissions**: Scoped to app
   - `APP_MANAGE_KB`
   - `APP_MANAGE_ROLES`

## Related Documentation

- [App Builders Overview](index.md) – Creating apps and knowledge bases
- [Powch: DeFi Banking + SSO](../../architecture/powch-defi-sso.md) – Authentication system
- [Cloud Services](../../services/cloud/services.md) – Backend services
