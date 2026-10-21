# Command Inventory & Guest Access Policy

This document catalogs all backend commands and their guest access status for consistency between frontend and backend.

## Guest Access Policy

**GUEST users** (unauthenticated) can:
- Browse public/promoted communities (read-only)
- View community and app details (read-only)
- Register new accounts

**Backend entitlement checks remain authoritative** – frontend UI gating is for UX only, not security.

## Command Inventory

### GUEST ALLOWED Commands

| Command | Purpose | Frontend Wrapper | Notes |
|---------|---------|----------------|-------|
| `find_communities` | Browse promoted communities | `fetchCommunities()` | Backend filters to public/promoted only |
| `get_community_details` | View community details | `getCommunityDetails()` | Read-only community info |
| `get_community` | Get single community info | `fetchCommunity()` | Read-only |
| `list_apps_for_community` | Browse apps in community | `fetchAppsForCommunity()` | Read-only app listing |
| `get_token_contract_addresses` | Get token contract info | `getTokenContractAddresses()` | Read-only contract addresses |
| `fetch_my_purchases` | Get user's communities/apps | `fetchMyCommunitiesAndApps()` | Returns featured communities for GUEST |

### AUTHENTICATION REQUIRED Commands

| Command | Purpose | Frontend Wrapper | Auth Level |
|---------|---------|----------------|------------|
| `purchase_product` | Purchase community/app | `purchaseProduct()` | CONNECTED; APP install gated by `verify_community_membership` (on-chain token holding). Price is informational only — priced (price>0) install is not implemented and fails loud. |
| `purchase_role` | Purchase role | `purchaseRole()` | CONNECTED; price informational only — priced (price>0) role purchase is not implemented and fails loud. |
| `ask_question_to_app` | Chat with app AI | N/A (via ChatWidget) | AUTHENTICATED + token balance |
| `ask_question_to_community` | Chat with community AI | N/A | AUTHENTICATED + token balance |
| `ask_question_to_knowledgebase` | Query knowledge base | N/A | AUTHENTICATED |
| `get_user_community_stats` | Get user stats/points | `getUserCommunityStats()` | AUTHENTICATED |
| `fetch_my_transactions` | Get purchase history | `fetchMyTransactions()` | AUTHENTICATED |
| `generate_referral_code` | Generate referral link | `generateReferralCode()` | AUTHENTICATED |
| `get_my_roles` | Get user's roles | `getMyRoles()` | AUTHENTICATED |
| `get_roles_for_scope` | Get roles for scope | `getRolesForScope()` | AUTHENTICATED |
| `join_community` | Join a community | `joinCommunity()` | AUTHENTICATED |
| `increment_rep` | Increment reputation | `incrementRep()` | AUTHENTICATED |
| `verify_wallet_for_mcp` | Verify wallet for MCP | N/A | AUTHENTICATED |
| `verify_subscription` | Verify subscription | N/A | AUTHENTICATED |
| `process_deep_link` | Process referral link | `validateReferral()` | AUTHENTICATED |
| `price_catalogue_purchase` | Price a checkout from the purchase catalogue | N/A (Powch `create_checkout_session` calls it as the buyer) | AUTHENTICATED |

### ADMIN/DEVELOPER ONLY Commands

These commands require specific permissions and are not available to regular users or GUEST:

- `create_community_from_drive_folder` – Requires PLATFORM_MANAGE_COMMUNITIES
- `create_app_from_drive_folder` – Requires COMMUNITY_MANAGE_APPS or PLATFORM_MANAGE_APPS
- `create_role` – Requires PLATFORM_MANAGE_ROLES
- `verify_app_drive_folder_structure` – Requires permissions
- `verify_community_drive_folder_structure` – Requires permissions
- `upload_local_folder` – Requires permissions
- `share_folder_with_descix` – Requires permissions
- `upload_and_share_folder` – Requires permissions
- `create_community_from_local` – Requires permissions
- `create_app_from_local` – Requires permissions
- `query_knowledge_base` – Requires permissions
- `get_kb_rag_status` – Requires permissions
- `delete_kb_rag` – Requires permissions
- `list_kb_rag_files` – Requires permissions
- `get_kb_rag_file_content` – Requires permissions
- `explain_concept_rag` – Requires permissions
- `search_related_files_rag` – Requires permissions
- `get_kb_rag_file_summary` – Requires permissions
- `replyToDiscordUserCloudFunction` – Bot-only command
- `proxy_api_request` – Internal/utility

## Implementation Notes

### Shared Constants

- **Backend**: the published `@descix/cloud-core` package exports `GUEST_ALLOWED_COMMANDS` (`src/config.js`); the Cloud's apiFront reads it
- **Frontend**: the published `@descix/app-sdk` package exports its own `GUEST_ALLOWED_COMMANDS` (`src/util/AppData.jsx`), for UI gating only; the backend check is authoritative
- The two lists are kept in sync by hand (no automatic sync mechanism)

### fetch_my_purchases Special Handling

The `fetch_my_purchases` command is allowed for GUEST users. When called by a GUEST:
- Backend returns featured/promoted communities (filtered to public/EGPT)
- Returns empty apps array
- Returns null for wallet_address and signature

This allows the frontend to use a single API call (`fetchMyCommunitiesAndApps()`) for both authenticated and guest users, with the backend handling the appropriate response.

### Frontend Usage

Frontend components should:
1. Check `GUEST_ALLOWED_COMMANDS.includes(command)` before calling `makeCommandRequestJSON()`
2. Pass `allowGuest = true` for guest-allowed commands
3. Handle GUEST status in UI (show registration prompts, gate paid features)
4. Never rely on frontend checks for security – backend is authoritative

### Backend Usage

Backend `cloud_function_route`:
1. Checks `utils.GUEST_ALLOWED_COMMANDS.includes(command)` to determine if command is guest-allowed
2. Sets `currentLoginStatus = LoginStatus.GUEST` for guest commands
3. Allows `user = null` for guest commands
4. Enforces authentication requirements for non-guest commands via `requiresAuthentication` check

## Maintenance

When adding new commands:
1. Add command to `CommandHandler.commands` in `apiFront.js`
2. Determine if command should be guest-allowed (read-only browsing vs. user-specific data)
3. If guest-allowed, add to `GUEST_ALLOWED_COMMANDS` in both `utils.js` and `AppData.jsx`
4. Update this documentation table
5. Ensure backend command handler properly handles `user = null` for guest commands

## Related Documentation

- [Services Architecture](services.md) – Service layer design
- [Platform Architecture](../../architecture/index.md) – Overall platform architecture
