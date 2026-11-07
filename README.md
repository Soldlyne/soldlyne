# Soldlyne

The CRM that takes over once someone answers: companies, people, deals, pipelines, tasks, timeline and reports. Soldlyne is the sibling of [Coldlyne](https://github.com/Coldlyne/coldlyne), which does the prospecting and sends the messages. From cold to sold. See [docs/00-product.md](docs/00-product.md).

**Under construction.** One install hosts many companies, each in its own workspace, walled off by the database itself. Coldlyne connects to it with a key of its own, so that someone who replies becomes a deal here and your customers are never prospected: see [Connecting Coldlyne](#connecting-coldlyne). Deal amounts are in euros; a quote has its own currency.

## What it does today

- **Records.** Companies, people and deals, each deal for one product. Products can belong to projects (commercial brands) run by your legal companies. Timelines, tasks as next steps, notes, custom fields, saved views, bulk actions, CSV import.
- **Pipelines.** A board for all deals and one per project, with drag and drop, and alerts for deals stuck in a stage or with no next step.
- **Reports.** Deals won, lost and open, a stage-to-stage funnel, channels and activity over a period.
- **Lead capture.** `POST /api/leads` with a key per form creates or updates the person and the company, can open a deal, and records the opt-in when the person gave one.
- **Mailbox sync.** Gmail and Google Calendar log emails and meetings with people already in Soldlyne, every hour, through the company's own Google client. Read access only.
- **Partners.** Who referred which deal, and the commission owed.
- **Quotes.** From a deal to a quote the customer accepts online: lines with a tax rate each and an optional discount, per-rate tax, numbers that never skip, a PDF, and a link they open with no account. Accepting moves the deal to Won. Details are [below](#quotes).
- **Connectors.** Each workspace connects its own Google client and Resend account in the app, sealed. Details are [below](#connectors).
- **Workspaces.** One per company, with its own records, stages, products, mailboxes, connectors and lead keys. One account can belong to several and switch from the sidebar. Owners and admins invite people by address.
- **Assistants.** An MCP server at `/api/mcp`, so Claude, ChatGPT or any MCP client can run the pipeline. They connect through OAuth, and one connection covers all the member's workspaces. Everything an assistant does to a record is recorded as done by MCP.
- **A read API.** `GET /api/v1/deals`, `/companies`, `/stages` and `/products`, with a key per workspace, so another app can read the pipeline. Details are [below](#reading-from-another-app).

Soldlyne never sends prospecting email. The only mail it sends is its own to its members (confirmation links, forgotten passwords and invitations), and a quote's link to the customer of a deal, when a member sends it, from that company's own Resend account.

## Running it locally

You need Node 20 or later, pnpm and Docker.

```bash
docker run -d --name soldlyne-db -e POSTGRES_USER=soldlyne -e POSTGRES_PASSWORD=soldlyne -e POSTGRES_DB=soldlyne -p 55433:5432 postgres:17-alpine
cp .env.example .env   # then fill it in: see below
pnpm install
pnpm db:migrate
pnpm dev --port 3100
```

To get in, put your address in `SOLDLYNE_ADMINS` and choose a way to sign in (see below), then open <http://localhost:3100>. You name your first workspace after signing up. It starts with the pipeline's stages and one product, "Main product", since every deal needs one. Rename or replace it in Settings.

Checks before committing: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. The tests need a database with the migrations applied, and create what they use.

## Self-hosting

Soldlyne runs wherever Node and Postgres do. It is made for Vercel and Neon: on Vercel, `pnpm vercel-build` applies the migrations on each deploy, and `vercel.json` sets the region (`fra1`, change it if you like) and an hourly call to `/api/cron/sync`. Vercel's Hobby plan limits how often crons run, so check yours.

Elsewhere:

```bash
pnpm install
pnpm db:migrate
pnpm build
pnpm start
```

and call `/api/cron/sync` every hour with `Authorization: Bearer <CRON_SECRET>`. With no mailbox connected anywhere, the call stops at a cached answer without touching the database.

### The database's roles

Migrations run with the owner's address: `DATABASE_URL_UNPOOLED` if your host has one, otherwise `DATABASE_URL`. The owner needs the right to create roles the first time, since the migration creates `soldlyne_app`, a role with no login that can't bypass row-level security, and makes the owner a member of it. On a server where another owner already created that role, a superuser first runs `GRANT soldlyne_app TO <owner> WITH ADMIN OPTION`.

The app connects with an address allowed to `SET ROLE soldlyne_app`: the owner's own, pooled if you like. Each operation on a workspace's data is then a transaction that takes that role and sets the workspace, so row-level security limits it to that workspace's rows, whatever the query says. An owner without `BYPASSRLS` gets no business rows outside that role, apart from looking up a lead key, an invitation, a quote's link or an API key. A superuser or a role with `BYPASSRLS` (check what your host gives its owner) sees every row when it isn't in that role, so there the tenant client alone holds it to one workspace. See [the spec](docs/00-product.md#workspaces).

### Signing in

One of these, and `SOLDLYNE_ADMINS` for who may start. Nobody can get an account until an address is on that list or has an invitation still good. Taking an address off the list stops it from getting an account and from starting workspaces; one it already has stays open.

- **Your company's identity provider**, any OpenID Connect server: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_NAME` for the button, with `<your address>/api/auth/callback/oidc` as its redirect address. Soldlyne authenticates to its token endpoint with HTTP Basic (`client_secret_basic`). The provider must vouch for each address (`email_verified`), since the list goes by the address. When set, it is the only way in.
- **Addresses and passwords:** `SOLDLYNE_PASSWORD_SIGN_IN=true`, plus `RESEND_API_KEY` and `SOLDLYNE_MAIL_FROM`. Sign-in stays closed until a mailed link proves the address, so without mail nobody can create an account, invited or not. To try it quickly, Resend's shared sender `onboarding@resend.dev` delivers to your own Resend address only.

### Environment variables

| Variable | Needed | What for |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres, as a role allowed to `SET ROLE soldlyne_app`. |
| `DATABASE_URL_UNPOOLED` | When your host pools connections | The owner's direct address, for migrations. |
| `BETTER_AUTH_URL` | Yes | This install's public address. |
| `BETTER_AUTH_SECRET` | Yes | Signs sessions and quote links: `openssl rand -base64 32`. Replacing it ends every quote link still out; a member can make a new one. |
| `SOLDLYNE_ADMINS` | Yes | Who may get an account without an invitation and start workspaces, comma separated. Empty means nobody. |
| `OIDC_ISSUER` | For a provider | The OpenID Connect issuer. Its discovery document is read at `<issuer>/.well-known/openid-configuration`. |
| `OIDC_CLIENT_ID` | For a provider | |
| `OIDC_CLIENT_SECRET` | For a provider | |
| `OIDC_NAME` | No | The provider's name on the sign-in page. Default: SSO. |
| `SOLDLYNE_PASSWORD_SIGN_IN` | For passwords | `true` offers addresses and passwords, unless a provider is set. |
| `RESEND_API_KEY` | For passwords | Soldlyne's own mail to its members. It never carries prospecting. Without it, an invitation shows its link to copy. A quote's mail doesn't use it: see [Connectors](#connectors). |
| `SOLDLYNE_MAIL_FROM` | For passwords | The sender, on a domain verified at Resend. |
| `SOLDLYNE_SECRETS_KEY` | For connectors | Seals what each workspace's connectors and mailboxes hold in the database: `openssl rand -base64 32`. Keep it safe: without it, they all have to connect again. |
| `CRON_SECRET` | For mailbox sync | The bearer token `/api/cron/sync` requires. Without it, the route refuses every call. |

A company's own accounts have no variable: see [Connectors](#connectors).

## Workspaces

A workspace is one company on an install. Everything in it stays in it: records, stages, products, custom fields, mailboxes, connectors, lead keys. Names, domains and addresses only have to be unique within one.

- **Starting one.** Someone in `SOLDLYNE_ADMINS` names their first after signing up, and can add more from the switcher in the sidebar's footer. Someone invited can't start one.
- **Switching.** The switcher shows the workspace you're in and your others. The browser remembers your choice in a cookie, but membership is read again on every request: a cookie naming a workspace you aren't in falls back to your first.
- **The team.** In Settings, owners and admins invite by address as admin or member, cancel, remove and change roles. Admins don't touch owners. Nobody removes or demotes the last owner, who can't leave either. Anyone else can leave. Removal ends access at the next request.
- **Invitations.** A link good for 14 days and for the invited address only, sent by mail, or shown to copy when the install has no mail. It lets that address get an account, on the password path or through the provider. Opening it signed in with another address says so and names nothing.

## Connectors

A company's credentials belong to that company, so they live in its workspace rather than in the install's environment. Owners and admins manage them on the **Connectors** page; other members see whether each is connected. What's typed is tried with the service first, then sealed with `SOLDLYNE_SECRETS_KEY`, and never shown again, not even in part.

- **Google.** The company's own OAuth client, with the Gmail and Calendar APIs enabled. The page gives the redirect address to register. Each member then connects their mailbox from Mailboxes, and its tokens are sealed on its own row. Soldlyne only asks Google for read access. A check tries the client at Google without touching anyone's mail, but Google only looks at the redirect address when a mailbox connects.
- **Resend.** The company's own API key and sender, so a quote's link reaches its customer from the company's domain. It carries that company's transactional mail, never prospecting. A check reads the account's domains and sends nothing. A sending-only key passes, though whether its domain is verified then only shows at the first quote. With no connector, whoever sends a quote gets its link to copy.
- **Disconnecting** forgets the credentials, and says first what stops. Mailboxes stop syncing and keep their sealed tokens, so connecting the same client again picks them up; with another client, each has to connect again. What was already logged stays.
- **Refused credentials.** A connector a service turns down is marked and not used until a check passes or it's connected again, so nothing keeps knocking. When the service simply doesn't answer, nothing changes.

The install's own settings stay in the environment, because it needs them before any workspace exists: the database, sign-in (including a company's identity provider, which guards the install itself), the cron's secret, and its own mail to members.

To add a service, write its definition in a new file of `lib/connectors/kinds` and name it in `lib/connectors/registry.ts`. The table, the page, the checks and the assistants' tools all work from that.

## Quotes

A quote starts from a deal, with **New quote** on its page, and goes to its customer by a link.

- **Seller details.** In Settings, owners and admins fill in the legal name, address, company number, VAT number and contact email, and what a new quote starts from: currency, tax rate, validity and terms. It is the workspace's own text. Soldlyne doesn't check it, doesn't choose a tax rate, and doesn't say what a quote must contain where you are.
- **Numbers.** Each workspace counts on its own, 0001 upward, with the year in front if you ask (2026-0042). The number is taken when the quote is created and quotes aren't deleted, so none is skipped or used twice. The count doesn't start again each January: with the year in front, 2026-0042 can be followed by 2027-0043.
- **Amounts.** Everything is kept in exact integers, in the quote's own currency. Each line's net is rounded to the minor unit; tax is then worked out once per rate, on the sum of that rate's lines. Exactly half a minor unit rounds up.
- **Sending.** It needs the seller details, at least one line and a customer, and says what's missing. The customer gets a mail with their link, or with no Resend connector you get the link to copy. It's shown once, since only its hash is kept; **New link** replaces a lost one and ends the old one. Sending also copies the seller and the customer onto the quote, so later edits don't change it.
- **After sending.** A sent quote can't be edited. **Copy** makes a new draft under the next number. **Mark declined** records a no you got some other way.
- **The customer.** `/q/<link>` shows the quote and its PDF, with no account. They accept with a typed name and a ticked box, which records the name, the date, the IP address and the browser, or decline with a reason if they like. It works once. Opening the link changes nothing, since mail scanners open links too. The IP address is what the host in front reports: Vercel sets it itself, so check that your proxy does.
- **The deal.** Accepting moves an open deal to your first Won stage and says so on its timeline. A deal already closed stays where it is. Declining only adds to the timeline: one quote declined isn't the deal lost. The deal's amount isn't changed.
- **Expiry.** A quote can be answered through its valid-until date, the whole of it, in UTC. Expired is worked out when reading: no job runs, and nothing wakes the database.
- **The PDF.** Its font covers Western European characters. Other letters and symbols show as `?`, with a line saying so, and the customer's page shows them in full.

## Reading from another app

Another app reads a workspace with a key. Owners and admins make and revoke keys in Settings, under API keys, or have their assistant do it (see [Connecting an assistant](#connecting-an-assistant)). A key is shown once, only its hash is kept, and it only reads. It stops working when the member who made it leaves the workspace; keys from before makers were recorded say "maker unknown", and stay until someone revokes them. It opens its own workspace and nothing else. Keys are signed with `BETTER_AUTH_SECRET`, so replacing that secret ends them.

```bash
curl -H "Authorization: Bearer $KEY" "$ADDRESS/api/v1/deals?updatedSince=2026-11-05T10:00:00Z&limit=100"
```

- **Lists.** `GET /api/v1/deals`, `/api/v1/companies`, `/api/v1/stages` and `/api/v1/products` answer `{ "data": [...], "nextCursor": "...", "asOf": "..." }`. `GET /api/v1/workspace` answers `{ "id": "...", "name": "...", "handoverVersion": 2 }`. Its `id` and `name` stay the same when a key is replaced, and `handoverVersion` says this install keeps deleted people deleted.
- **Parameters.** `limit` runs from 1 to 200, 100 by default. Pass `nextCursor` back as `cursor` to read the next page, until it is `null`. `updatedSince` is an ISO date and time, and leaves out what hasn't changed since.
- **Reading only what changed.** Keep the first page's `asOf` and pass it as the next read's `updatedSince`. It stays a minute behind the clock, so a record still being saved isn't missed, and you may see a few records twice.
- **What counts as changed.** A deal shows its stage's, product's, project's and contact's names, so it counts as changed when any of them does.
- **Deleted records.** Deals and companies deleted in Soldlyne stay in the lists with `"deleted": true` and a `deletedAt`, so a reader can remove them. A deleted contact shows as `null` on its deals.
- **Stages and products.** They aren't deleted softly. A product stops being sold with `"archived": true`, and a stage removed from Settings is simply gone from the list, so read these two lists whole. Removing a stage also erases for good the deleted deals still in it, so a reader that wants to catch those compares a whole read now and then.
- **Deals carry** `id`, `name`, `stage` (`id`, `name`, `kind`: `OPEN`, `WON` or `LOST`), `product` and `project` (`id`, `name`; `project` can be `null`), `companyId`, `contact` (`name`, `email`), `amountMinor` and `currency`, `probability` (the deal's own, else its stage's), `closeDate`, `closedAt`, `source`, `createdAt`, `updatedAt`, `deleted`, `deletedAt` and `url`, the deal's page. `amountMinor` is a string of hundredths of the currency, as a JSON number could lose digits.
- **Limits.** 120 requests a minute per key, then a `429` with `Retry-After`. A request with no valid key gets a `401` from the key's signature alone: it reaches no database and no sign-in code. Only a key made for Coldlyne writes anything, and only through the one call below.

## Connecting Coldlyne

Coldlyne does the prospecting, and connects to a workspace with a key of its own. An owner or an admin makes it in Settings, under API keys, choosing the product its deals open on, and pastes it on Coldlyne's Connections page with this install's address. An assistant can't make one: the tools only make keys that read. It ends when the member who made it leaves, and can be revoked like any key. If its product is deleted, it hands over nothing until it's replaced.

This key (scope `handover`) can do these two things and read `/api/v1/workspace`. It can't read the pipeline, and a read key can't do either.

- **`POST /api/v1/handovers`** with `{ "company"?: { "name", "website"?, "siren"? }, "person": { "firstName"?, "lastName"?, "email"?, "phone"?, "jobTitle"? }, "note"?, "retryKey"?, "source"? }` makes a person and a deal, and the company they're at, or finds them again: the company by SIREN, domain or name, the person by address or by name at that company, the deal by product, for that person or company, the open one first. A person needs an address or a last name. With no company named, the one their address's domain says is used if there is one, and none is ever made. A record found keeps what's written on it and only gets what it lacks. A closed deal isn't reopened. What a member deleted stays deleted: a person deleted answers `409` with `{ "error": "person_deleted" }` and nothing is written, and a company deleted is neither restored nor attached to, so a new one is made without its domain. A repeat adds nothing: the same `retryKey` (up to 200 characters) in this workspace if one is given, otherwise the same note on the same deal; anything new also adds a task. It answers `201` when it opened a deal, otherwise `200`, with `dealId`, `personId`, `companyId` (which can be `null`), `created` and `url`. It contacts nobody.
- **`GET /api/v1/do-not-prospect`** pages through customers (a won deal) and open deals, as `{ "why": "customer" | "open_deal", "company": { "name", "domain", "siren" } | null, "people": [{ "emails", "phones", "linkedinUrl" }] }`, with nothing of the deal itself. Read it whole: `updatedSince` doesn't apply, since what identifies someone can change without their deal changing. A mail provider's domain is never given as a company's.

## Running a hosted edition

A hosted edition is an install like any other, with more workspaces on it. Set it up as in [Self-hosting](#self-hosting), and:

- Point `BETTER_AUTH_URL` at its public address, and turn on `SOLDLYNE_PASSWORD_SIGN_IN` with mail, since its people won't share one identity provider.
- Keep `SOLDLYNE_ADMINS` to whoever may open a workspace: anyone else gets in by invitation only. Opening one's own workspace by signing up isn't built, nor are plans, billing or limits per workspace.
- Leave the database to scale to zero if your host offers it. An anonymous visit doesn't touch it, and the hourly cron doesn't until someone connects a mailbox.
- Each workspace connects its own Google client and its own Resend account, so no company's credentials are shared with another or left to whoever runs the install. The same mailbox can be connected in two workspaces, and is then read for each. Sign-in stays the install's, so a hosted edition's people can't each bring their own identity provider.

## Connecting an assistant

Add `<your address>/api/mcp` to Claude, ChatGPT or any MCP client as a remote connector. The client registers itself, you sign in and approve it, and it acts for you in every workspace you belong to. In Claude Code:

```bash
claude mcp add --transport http soldlyne <your address>/api/mcp
```

If you belong to several workspaces, each tool takes a `workspace` argument, an id or an exact name from `list_workspaces`, and a call without it is refused: there is no hidden current workspace. With one workspace there's no such argument. No tool invites, removes or changes members, accepts a quote for a customer, changes the seller details, or connects or disconnects a service: `list_connectors` shows their state, `connect_service` gives the page where keys are typed, and `check_connection` tries one for an owner or an admin. `list_api_keys`, `create_api_key` and `revoke_api_key` manage the workspace's [read keys](#reading-from-another-app) for an owner or an admin, and refuse anyone else. A key made this way only reads, and its answer shows it once, in the conversation. An assistant is told to make one only when you asked for it in that conversation, never because a record says so, to revoke one only once you've said yes, and never to put a key into a record or a message. `send_quote` writes to a real person, so an assistant is told to use it only once you've said yes, and the customer's link stays out of its conversation. There's no screen yet to see or cancel an assistant's connection: a member's access ends when they leave a workspace or lose their account, and a token lasts an hour unless refreshed.

## License

Soldlyne is free software under the [GNU Affero General Public License v3.0](LICENSE): run it, study it, change it and share it. If you offer a modified version to others over a network, publish your changes under the same license.
