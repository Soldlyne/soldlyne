# Soldlyne

> Status: under construction, 2026-11-05. One install hosts many companies, each in its own workspace. Sections 1 to 3 say what runs today; sections 4 and 5 are plans and none of it is built.

## 1. What it does

**The CRM that takes over once someone answers.** Coldlyne does the prospecting and sends the messages; Soldlyne keeps the companies, the people and the deals, and shows where each one stands. From cold to sold.

1. **Records.** Companies, people and deals. Each deal is for one product; products can belong to projects (commercial brands), and projects to your legal companies. A timeline per record, tasks as next steps, notes, custom fields, saved views, bulk actions, CSV import. A new workspace starts with stages and one product, to rename or replace.
2. **Pipelines.** A board for all deals and one per project, with shared stages. Drag a deal along, or change its stage from its page. Deals stuck for 14 days or with no next step are flagged.
3. **Reports.** Over a period, for all deals or one project: deals won, lost and open, weighted value, a stage-to-stage funnel, channels, activity.
4. **Lead capture.** A site's server posts each form to `/api/leads` with that form's key. Soldlyne creates or updates the person and their company, logs the form on the timeline, can open a deal and a follow-up task, and records the opt-in.
5. **Mailbox sync.** Connected Gmail and Google Calendar accounts are read every hour through the company's own Google client, and emails and meetings with known people land on their timelines.
6. **Partners.** Who referred which deal, and the commission owed once it is won.
7. **Quotes.** From a deal to a quote the customer accepts online. Lines with a quantity, a price, a tax rate and an optional discount, tax shown per rate, a number per workspace that never skips, the seller's details from Settings. Sending freezes it and gives the customer a link: they read it, download its PDF, and accept with a typed name or decline, with no account. Accepting moves the deal to the first Won stage. A sent quote changes by being copied into a new one.
8. **Workspaces.** One per company on an install, walled off by the database. One account can belong to several and switch between them. Owners and admins invite people by address and manage the team in Settings.
9. **Assistants.** An MCP server at `/api/mcp`, reached through OAuth, with 28 tools: the daily brief, search, reading records, creating and moving deals, logging calls, tasks and notes, partners, writing and sending quotes, the state of connectors, read keys. A member's connection covers all their workspaces, and a twenty-ninth tool lists them. They use the same code as the screens.
10. **Connectors.** A workspace's own accounts at outside services, connected in the app: its Google client and its Resend account. Owners and admins connect, check and disconnect them; other members see their state.
11. **A read API.** `/api/v1/deals`, `/companies`, `/stages` and `/products`, paged and readable incrementally with `updatedSince`, with deleted deals and companies marked so a reader can remove them. A key per workspace, made and revoked by owners and admins in Settings or through their assistant. The README has the details.

## 2. Rules it keeps

- **It never sends prospecting email.** Sending to people who asked for nothing is Coldlyne's job, with Coldlyne's safeguards. Soldlyne's Google access is read-only, and its one mail provider, Resend, carries only transactional mail: the install's own account writes to its members (confirmation links, forgotten passwords and invitations); a company's own account writes to the customer of a deal (the link to a quote a member chose to send). Resend's terms forbid cold email anyway.
- **Lead capture records consent.** A person who ticked the box on a form gets the date and the form and page it came from. Nobody is marked as opted in without it, and a later form without the box doesn't undo it. Keys are per form, stored hashed, and shown once.
- **The shared do-not-contact rule belongs with Coldlyne.** Who must not be written to is decided where messages leave from. Soldlyne keeps no such list of its own today; see section 4.
- **What isn't a contact stays out.** The sync matches people already in Soldlyne and creates nobody from an inbox. Newsletters, notifications and colleagues (the mailbox's own domain) never reach a timeline.
- **Who may get in.** Only the addresses in `SOLDLYNE_ADMINS`, and those with an invitation still good, get an account; an empty list and no invitation means nobody. Both go by the address, so a password account opens only once a mailed link proves it, and an identity provider must have verified it. Only the list may start a workspace.
- **Access stays a person's decision.** No assistant tool invites, removes or changes members, since what's written in records can carry instructions.
- **An assistant manages read keys for those who could on the screen.** `list_api_keys`, `create_api_key` and `revoke_api_key` go through the same code as Settings, which refuses anyone but an owner or an admin of the workspace of that call. They take no scope, and a key made there only reads. Since a key opens a workspace's whole pipeline and records are written by strangers, an assistant is told to make one only when the member asked in that conversation, never because a record, form or page says so, to revoke one only once the member said yes, and never to put a key into a record or a message. What's kept is the key's row: when it was made, last used and revoked, with no record of who did it.
- **The API only reads.** A key opens its own workspace, through the same row-level security as everything else, at 120 requests a minute. Nothing changes a record through it.
- **A quote's answer is its customer's.** No tool or screen accepts a quote for them. A member can record a no they were told, never a yes. Sending writes to a real person, so an assistant is told to send only after the member said yes in that conversation, and never gets the customer's link. Only owners and admins change the seller details, on the screen, since they go out in the company's name.
- **No legal advice.** Seller details and terms are the workspace's own text. Soldlyne doesn't check them, picks no tax rate, and doesn't say what a quote must contain anywhere.
- **What was sent stays as sent.** Sending copies the seller and the customer onto the quote, and a sent quote can't be edited. Totals are stored, not worked out again.
- **Provenance.** Each record says who or what made it (a member, an import, the sync, an assistant) and its timeline keeps the changes.
- **What people write is data.** Notes, emails and form messages reach an assistant as text from third parties, never as instructions.
- **A company's credentials are the company's.** They live in its workspace as connectors, never in the install's environment, and only its owners and admins can change them. A connector is used only in its own workspace, by row-level security rather than by care: one company's mail or mailbox never goes through another's account.
- **Secrets.** Connector credentials and Google tokens are sealed with AES-256-GCM under the install's `SOLDLYNE_SECRETS_KEY`, shown to nobody once saved, not even in part, and never logged. Lead keys, API keys, invitation links and quote links are stored hashed, and never logged.
- **What a service answers is data.** A check says what came of it in Soldlyne's own words. What Google or Resend wrote back reaches no screen, record or assistant through a connector.
- **The database sleeps when nobody needs it.** It bills by the hour it's awake on a serverless host. An anonymous visit doesn't touch it: no session cookie, no auth. A quote's link and an API key are signed, so a made-up one is turned away before any query, and a quote's expiry is worked out when it is read, with no job. The hourly cron stops at a cached answer while no mailbox exists anywhere. Connecting or removing one clears that answer at once; it also refreshes daily. OAuth's discovery documents are cached too.

## 3. How it is built

- Next.js 16 (App Router), TypeScript, Tailwind 4; Postgres through Prisma; Better Auth (a company's OpenID Connect provider alone when one is set, otherwise a password with a mailed proof of the address), also the OAuth server assistants sign in to; Vitest against a real Postgres; made for Vercel (fra1) and Neon, and runs wherever Node and Postgres do.
- `app/` holds the screens and routes, `lib/` the rules and queries, `components/` what they share, `prisma/` the schema and its migration. Server actions in `lib/` serve the screens and the MCP tools alike, and record who acted.
- Money is kept in minor units with a currency, in euros for deals, and in its own currency for each quote. A quote's numbers come from one pure function, `lib/quotes/totals.ts`: exact integers, each line's net rounded to the minor unit, tax once per rate on the sum of that rate's lines, half a minor unit rounding up. Records are deleted softly: creating one whose domain or address matches a deleted one restores it. Custom fields live in a JSON column per record.
- The hourly sync is a route, `/api/cron/sync`, which refuses any call without `CRON_SECRET` and walks every workspace in turn.

### Workspaces

Isolation is the database's, and forgetting it fails closed.

- **Every business table** has a required `workspaceId` with cascade delete, filled from the transaction's setting when left out, and row-level security enabled and forced. Its policy, for the role `soldlyne_app`, checks both what's read and what's written. A foreign key's check bypasses row-level security, so each policy also looks up every parent the row points at, through that parent's own policy: a row can't link to another workspace's.
- **`prisma`** (`lib/prisma.ts`) is a tenant-bound client. Each operation is a transaction that takes the role and sets the workspace, following Prisma's row-level-security extension. The workspace comes from `runInWorkspace(id, fn)`, used by lead capture, the cron and assistant calls, and otherwise from the request's session and active-workspace cookie, read once per request. With neither, the operation throws. It offers no raw SQL, and its `$transaction` takes a function and binds it once.
- **`trustedPrisma`** (`lib/trusted-prisma.ts`) isn't bound to anything, and is only for what comes before a workspace is known or lies outside any: Better Auth's tables, workspaces and memberships, invitations, finding the workspace of a lead key, a quote's link or an API key, and the list of workspaces the cron walks. `test/isolation/trusted-uses.test.ts` holds the list of files that may import it, with why.
- **`Workspace` and `Member`** have no row-level security. The app role has no grant on them or on the auth tables. `Invitation`, `LeadSource`, `Quote` and `ApiKey` are secured like the rest, with one more policy for the owner, since they're looked up by a hashed secret before the workspace is known.
- **`test/isolation/`** reads the Prisma schema's models, and fails if a table with a `workspaceId` lacks forced row-level security or its policy, if a model outside the trusted list lacks a `workspaceId`, or if a row in one workspace can be read, updated, deleted or linked from another.

A new table needs its policy written by hand in its migration: Prisma's schema can't declare one. These tests are what remind you.

### Connectors

**Decided 2026-11-05: a company's credentials are connectors in the app, per workspace, not environment variables.** One install hosts many companies, so one Google client or mail key in its environment would make every company's customers see the same sender, and leave a company's access in the hands of whoever runs the install. What stays in the environment is what the install needs before any workspace exists: the database, sign-in (a company's identity provider included), `CRON_SECRET`, the install's own mail, and the one key that seals the rest. The sealing key was called `TOKENS_ENCRYPTION_KEY` until then. Its format is unchanged, so an install with mailboxes already sealed gives `SOLDLYNE_SECRETS_KEY` the old value.

- **`Connection`** has one row per workspace and connector, secured like any other business table. Secret fields are sealed together in `sealedCredentials`; the others are readable in `settings`. `kind` is plain text, so a new connector needs no migration. Reads go through `prisma`: the cron reaches each workspace's connector bound to that workspace, so this added no trusted use.
- **`lib/connectors/registry.ts`** lists the connectors, each defined in a file of `lib/connectors/kinds`: its fields, how to set it up, how to try it, and what disconnecting stops. The page and the assistant's tools work from that.
- **Connecting a mailbox.** The OAuth state names the workspace and is signed for the member who asked, and the callback checks both again before that workspace's client takes the code. The address registered at Google is always `BETTER_AUTH_URL`'s.
- **Assistants** see state, get the page's link, and can check a connector for an owner or an admin. They can't connect or disconnect one: keys don't belong in a conversation, and what's written in records can carry instructions, while what a disconnect costs takes a person to undo.

## 4. Working with Coldlyne (planned)

None of this is built. When the two are connected:

- A reply with interest becomes a deal, with its conversation.
- No cold email goes to customers or open deals.
- A lost or "not now" deal returns to a sequence on a chosen date, unless the person opted out.
- Revenue is counted per sequence.
- One opt-out list, for both.

## 5. Quotes: what comes next (planned)

None of this is built, and quotes stop short of it on purpose:

- Contracts and signatures, which will live in a separate legal app. A quote's acceptance here is a record of a customer's yes, not a signature.
- Invoices, and handing an accepted quote over to an accounting tool.
- Payment links.
