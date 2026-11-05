# Soldlyne

The CRM that takes over once someone answers: companies, people, deals, pipelines, tasks, timeline and reports. Soldlyne is the sibling of [Coldlyne](https://github.com/Coldlyne/coldlyne), which does the prospecting and sends the messages. From cold to sold. See [docs/00-product.md](docs/00-product.md).

**Under construction.** One install hosts many companies, each in its own workspace, walled off by the database itself. The link with Coldlyne isn't built yet, so today the two run side by side and know nothing of each other. The plan is in [the spec](docs/00-product.md#4-working-with-coldlyne-planned). Deal amounts are in euros; a quote has its own currency.

## What it does today

- **Records.** Companies, people and deals, each deal for one product. Products can belong to projects (commercial brands) run by your legal companies. Timelines, tasks as next steps, notes, custom fields, saved views, bulk actions, CSV import.
- **Pipelines.** A board for all deals and one per project, with drag and drop, and alerts for deals stuck in a stage or with no next step.
- **Reports.** Deals won, lost and open, a stage-to-stage funnel, channels and activity over a period.
- **Lead capture.** `POST /api/leads` with a key per form creates or updates the person and the company, can open a deal, and records the opt-in when the person gave one.
- **Mailbox sync.** Gmail and Google Calendar log emails and meetings with people already in Soldlyne, every hour. Read access only.
- **Partners.** Who referred which deal, and the commission owed.
- **Quotes.** From a deal to a quote the customer accepts online: lines with a tax rate each and an optional discount, per-rate tax, numbers that never skip, a PDF, and a link they open with no account. Accepting moves the deal to Won. Details are [below](#quotes).
- **Workspaces.** One per company, with its own records, stages, products, mailboxes and lead keys. One account can belong to several and switch from the sidebar. Owners and admins invite people by address.
- **Assistants.** An MCP server at `/mcp`, so Claude, ChatGPT or any MCP client can run the pipeline. They connect through OAuth, and one connection covers all the member's workspaces. Everything an assistant does is recorded as done by MCP.

Soldlyne never sends prospecting email. The only mail it sends is its own to its members (confirmation links, forgotten passwords and invitations), and a quote's link to the customer of a deal, when a member sends it.

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

The app connects with an address allowed to `SET ROLE soldlyne_app`: the owner's own, pooled if you like. Each operation on a workspace's data is then a transaction that takes that role and sets the workspace, so row-level security limits it to that workspace's rows, whatever the query says. An owner without `BYPASSRLS` gets no business rows outside that role, apart from looking up a lead key, an invitation or a quote's link. A superuser or a role with `BYPASSRLS` (check what your host gives its owner) sees every row when it isn't in that role, so there the tenant client alone holds it to one workspace. See [the spec](docs/00-product.md#workspaces).

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
| `RESEND_API_KEY` | For passwords | Soldlyne's own mail. It never carries prospecting. Without it, an invitation or a quote shows its link to copy. |
| `SOLDLYNE_MAIL_FROM` | For passwords | The sender, on a domain verified at Resend. |
| `GOOGLE_CLIENT_ID` | For mailbox sync | A Google OAuth client with the Gmail and Calendar APIs enabled and `<your address>/api/google/callback` as a redirect address. An Internal consent screen avoids Google's review. |
| `GOOGLE_CLIENT_SECRET` | For mailbox sync | |
| `TOKENS_ENCRYPTION_KEY` | For mailbox sync | Encrypts the Google tokens in the database: `openssl rand -base64 32`. Keep it safe: without it, mailboxes have to connect again. |
| `CRON_SECRET` | For mailbox sync | The bearer token `/api/cron/sync` requires. Without it, the route refuses every call. |

## Workspaces

A workspace is one company on an install. Everything in it stays in it: records, stages, products, custom fields, mailboxes, lead keys. Names, domains and addresses only have to be unique within one.

- **Starting one.** Someone in `SOLDLYNE_ADMINS` names their first after signing up, and can add more from the switcher in the sidebar's footer. Someone invited can't start one.
- **Switching.** The switcher shows the workspace you're in and your others. The browser remembers your choice in a cookie, but membership is read again on every request: a cookie naming a workspace you aren't in falls back to your first.
- **The team.** In Settings, owners and admins invite by address as admin or member, cancel, remove and change roles. Admins don't touch owners. Nobody removes or demotes the last owner, who can't leave either. Anyone else can leave. Removal ends access at the next request.
- **Invitations.** A link good for 14 days and for the invited address only, sent by mail, or shown to copy when the install has no mail. It lets that address get an account, on the password path or through the provider. Opening it signed in with another address says so and names nothing.

## Quotes

A quote starts from a deal, with **New quote** on its page, and goes to its customer by a link.

- **Seller details.** In Settings, owners and admins fill in the legal name, address, company number, VAT number and contact email, and what a new quote starts from: currency, tax rate, validity and terms. It is the workspace's own text. Soldlyne doesn't check it, doesn't choose a tax rate, and doesn't say what a quote must contain where you are.
- **Numbers.** Each workspace counts on its own, 0001 upward, with the year in front if you ask (2026-0042). The number is taken when the quote is created and quotes aren't deleted, so none is skipped or used twice. The count doesn't start again each January: with the year in front, 2026-0042 can be followed by 2027-0043.
- **Amounts.** Everything is kept in exact integers, in the quote's own currency. Each line's net is rounded to the minor unit; tax is then worked out once per rate, on the sum of that rate's lines. Exactly half a minor unit rounds up.
- **Sending.** It needs the seller details, at least one line and a customer, and says what's missing. The customer gets a mail with their link, or with no mail set up you get the link to copy. It's shown once, since only its hash is kept; **New link** replaces a lost one and ends the old one. Sending also copies the seller and the customer onto the quote, so later edits don't change it.
- **After sending.** A sent quote can't be edited. **Copy** makes a new draft under the next number. **Mark declined** records a no you got some other way.
- **The customer.** `/q/<link>` shows the quote and its PDF, with no account. They accept with a typed name and a ticked box, which records the name, the date, the IP address and the browser, or decline with a reason if they like. It works once. Opening the link changes nothing, since mail scanners open links too. The IP address is what the host in front reports: Vercel sets it itself, so check that your proxy does.
- **The deal.** Accepting moves an open deal to your first Won stage and says so on its timeline. A deal already closed stays where it is. Declining only adds to the timeline: one quote declined isn't the deal lost. The deal's amount isn't changed.
- **Expiry.** A quote can be answered through its valid-until date, the whole of it, in UTC. Expired is worked out when reading: no job runs, and nothing wakes the database.
- **The PDF.** Its font covers Western European characters. Other letters and symbols show as `?`, with a line saying so, and the customer's page shows them in full.

## Running a hosted edition

A hosted edition is an install like any other, with more workspaces on it. Set it up as in [Self-hosting](#self-hosting), and:

- Point `BETTER_AUTH_URL` at its public address, and turn on `SOLDLYNE_PASSWORD_SIGN_IN` with mail, since its people won't share one identity provider.
- Keep `SOLDLYNE_ADMINS` to whoever may open a workspace: anyone else gets in by invitation only. Opening one's own workspace by signing up isn't built, nor are plans, billing or limits per workspace.
- Leave the database to scale to zero if your host offers it. An anonymous visit doesn't touch it, and the hourly cron doesn't until someone connects a mailbox.
- Each workspace can connect its own Google mailboxes through the install's one Google OAuth client. The same address can be connected in two workspaces, and is then read for each.

## Connecting an assistant

Add `<your address>/mcp` to Claude, ChatGPT or any MCP client as a remote connector. The client registers itself, you sign in and approve it, and it acts for you in every workspace you belong to. In Claude Code:

```bash
claude mcp add --transport http soldlyne <your address>/mcp
```

If you belong to several workspaces, each tool takes a `workspace` argument, an id or an exact name from `list_workspaces`, and a call without it is refused: there is no hidden current workspace. With one workspace there's no such argument. No tool invites, removes or changes members, accepts a quote for a customer, or changes the seller details. `send_quote` writes to a real person, so an assistant is told to use it only once you've said yes, and the customer's link stays out of its conversation. There's no screen yet to see or cancel an assistant's connection: a member's access ends when they leave a workspace or lose their account, and a token lasts an hour unless refreshed.

## License

Soldlyne is free software under the [GNU Affero General Public License v3.0](LICENSE): run it, study it, change it and share it. If you offer a modified version to others over a network, publish your changes under the same license.
