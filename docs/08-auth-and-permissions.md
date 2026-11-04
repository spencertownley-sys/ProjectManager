# 08. Authentication and Permissions

Version 1.0, 03 Nov 2026. Owner: Engineering.

## 1. Summary

Clerk is the identity provider. It owns sign-up, sign-in, sessions, multi-factor authentication, organizations (workspaces), invitations, and later enterprise SSO. Meridian owns authorization: it decides what a signed-in member may see and do, using membership and role data mirrored from Clerk plus its own project-level roles.

## 2. Clerk configuration

### 2.1 Application settings (Clerk Dashboard)

- Sign-in methods: email with code, Google, Microsoft. Password sign-in enabled as a fallback. Passkeys enabled.
- Multi-factor: optional for all users; required for workspace owners and admins (enforced by Meridian, see section 4.3).
- Organizations: enabled. Members can create organizations. Maximum memberships per user: unlimited.
- Organization roles: `org:owner`, `org:admin`, `org:member`, `org:guest` (custom role). Permissions in Clerk are informational; Meridian enforces its own matrix.
- Session token customization: add `role` claim with value `authenticated` (required by the Supabase third-party auth integration) and keep `org_id` and `org_role` in the token.
- Account Portal: enabled for hosted sign-in pages during Phase 0; replaced by in-app `/sign-in` and `/sign-up` routes with Clerk components styled to the design system in Phase 1.
- Webhooks: `user.created`, `user.updated`, `user.deleted`, `organization.created`, `organization.updated`, `organization.deleted`, `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`, `organizationInvitation.accepted` pointed at `/api/webhooks/clerk`, verified with the Svix signing secret.

### 2.2 Next.js integration

Package `@clerk/nextjs`. Environment variables (see `.env.example`):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/onboarding
```

Middleware (`proxy.ts` on Next.js 16; `middleware.ts` on 15):

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublic = createRouteMatcher([
  '/', '/features(.*)', '/pricing', '/changelog(.*)', '/legal(.*)', '/developers(.*)',
  '/sign-in(.*)', '/sign-up(.*)',
  '/api/webhooks/(.*)', '/api/public/(.*)', '/api/inngest', '/api/v1/(.*)'
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
```

`/api/v1/*` is public to middleware because it authenticates with API keys inside the route handler, not with a Clerk session.

`ClerkProvider` wraps the app in `app/layout.tsx`. Auth-dependent server components call `await auth()` or `await currentUser()` and are wrapped in `<Suspense>` because Cache Components are enabled.

### 2.3 Membership sync

The Clerk webhook handler upserts `users`, `workspaces`, and `workspace_members`. Clerk role to Meridian role mapping:

| Clerk org role | Meridian workspace role |
|---|---|
| org:owner | owner |
| org:admin | admin |
| org:member | member |
| org:guest | guest |

Meridian never writes membership back to Clerk except through explicit admin actions (invite, change role, remove), which call the Clerk Backend API and then rely on the webhook for the mirror. A nightly Inngest job reconciles drift by listing organization memberships.

### 2.4 Active workspace

Clerk's active organization (`orgId` in the session) selects the workspace. The URL slug `/w/[workspaceSlug]` must match the active organization; if it does not, the app calls `setActive` client-side and redirects. This keeps the Supabase Realtime token's `org_id` claim aligned with what the user is viewing.

## 3. Roles

### 3.1 Workspace roles

| Role | Description |
|---|---|
| Owner | Full control including billing, deletion, and ownership transfer. At least one per workspace. |
| Admin | Everything except billing and workspace deletion. Manages members, libraries, integrations. |
| Member | Creates and edits work in projects they can access. Creates projects and teams. |
| Guest | External collaborator. Sees only projects where they hold an explicit project role. Cannot see member directory beyond people in shared projects. Cannot create projects. |

### 3.2 Project roles

Applied through `project_members`. For projects with `privacy = workspace` or `team`, members without an explicit row get the implied role shown below.

| Role | Implied for | Capabilities |
|---|---|---|
| Owner | Project creator | Everything on the project including deletion, workflow, fields, automations, members |
| Editor | Workspace members on workspace projects; team members on team projects | Create, edit, move, complete, delete tasks; manage sections; save shared views; post status updates if also listed as a project owner or admin |
| Commenter | Guests by default on shared projects | Read everything, comment, upload attachments to comments, be assigned |
| Viewer | Portfolio-only access, executive sponsors | Read only |

Workspace owners and admins hold Owner on every project.

## 4. Permission matrix

Legend: Y allowed, N denied, O only own items (for comments, own comments).

| Action | WS Owner | WS Admin | Member (Editor) | Guest (Commenter) | Viewer |
|---|---|---|---|---|---|
| View workspace settings | Y | Y | N | N | N |
| Manage billing | Y | N | N | N | N |
| Invite members | Y | Y | Y (members only, setting) | N | N |
| Create team | Y | Y | Y | N | N |
| Create project | Y | Y | Y | N | N |
| Delete project | Y | Y | Project owner only | N | N |
| Edit project settings, workflow, fields | Y | Y | Project owner only | N | N |
| Create task | Y | Y | Y | N | N |
| Edit any task field | Y | Y | Y | Assigned tasks: status and comments only | N |
| Delete task | Y | Y | Y | N | N |
| Comment | Y | Y | Y | Y | N |
| Edit or delete comment | Y | Y | O | O | N |
| Upload attachment | Y | Y | Y | Y | N |
| Save personal view | Y | Y | Y | Y | Y |
| Save shared view | Y | Y | Y | N | N |
| Post status update | Y | Y | Project owner | N | N |
| Manage cycles | Y | Y | Y | N | N |
| Create automation | Y | Y | Project owner | N | N |
| Create form | Y | Y | Project owner | N | N |
| Manage API keys, webhooks | Y | Y | N | N | N |
| Manage connectors (workspace) | Y | Y | N | N | N |
| Connect personal chat or calendar | Y | Y | Y | Y | Y |
| Export project | Y | Y | Y | N | N |
| Export workspace | Y | N | N | N | N |
| View member directory | Y | Y | Y | Shared projects only | Shared projects only |

### 4.3 Elevated action requirements

Deleting a workspace, transferring ownership, exporting the workspace, and revoking all API keys require a recent (within 10 minutes) second-factor verification. Meridian checks Clerk's `fva` (factor verification age) claim and prompts re-verification through Clerk's `reverification` helper.

## 5. Enforcement

### 5.1 Service layer

Every service function receives an `Actor` (`{ userId, workspaceId, workspaceRole }`) resolved from the Clerk session or API key, and calls `authorize(actor, action, resource)` before doing anything. `authorize` loads project role (cached per request) and consults the matrix in `/lib/auth/permissions.ts`, which is the single source of truth for section 4. Unit tests assert the matrix row by row (document 15).

### 5.2 API keys

API keys carry the workspace and scopes (`read`, `write`, `admin`). They act as a synthetic actor with workspace role `admin` limited by scopes; per-project visibility follows the same rules as a workspace admin. Keys are hashed with SHA-256 at rest; the prefix (`mrd_live_a1b2c3d4`) is stored for display.

### 5.3 Database layer

Row-level security policies on Realtime-published tables use Clerk claims via Supabase third-party auth (document 06, section 6). The browser's Supabase client is created with an `accessToken` callback that returns `await getToken()` from Clerk. Server code uses the service role and never relies on RLS for writes.

Clerk setup for Supabase: use Clerk's "Connect with Supabase" page, which adds the `role: authenticated` claim to session tokens; then add Clerk as a third-party auth provider in the Supabase dashboard. The older JWT template approach with a shared secret is deprecated and must not be used.

## 6. Guests and external sharing

- Guests are invited to specific projects. Accepting the invite creates a Clerk membership with `org:guest` and a `project_members` row.
- Public, read-only share links for Gantt, Timeline, and Dashboard views are a phase 2 feature (`share_links` table) with optional password and expiry.
- Form submission is anonymous by design and never creates a user.

## 7. Sessions and devices

- Clerk session lifetime: 7 days inactive, 30 days maximum; configurable per workspace in phase 4.
- Users can see and revoke active sessions through Clerk's `<UserProfile>` component embedded in Settings.

## 8. Audit

Membership and role changes, API key events, webhook changes, exports, and elevated actions are recorded in a `workspace_audit` table added in phase 2 and exported in phase 4. Until then, they are logged with structured logs and retained for 90 days.
