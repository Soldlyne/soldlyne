# Design notes

Ideas taken from studying Twenty (twentyhq/twenty, AGPL). Concepts only, no code copied.

These are the ideas as they were noted, not a description of what runs: for that, see [00-product.md](00-product.md).

## Data model
- Fixed Prisma models plus a JSONB `custom` column per record, instead of a runtime metadata engine.
- Money as integer minor units plus currency code.
- Polymorphic links as one nullable foreign key per target (companyId, personId, dealId), so deletes cascade.
- `createdBy` actor stored on the row (USER, IMPORT, SYNC, MCP, SYSTEM).
- Soft delete with `deletedAt`; creating a record whose domain or email matches a deleted one restores it.
- Timeline stores only field diffs; edits by the same actor within 10 minutes merge into one entry.
- Board order is a float `position`: top = first - 1, bottom = last + 1, otherwise the midpoint.
- Links made by the sync are automatic; `Activity.manuallyLinked` stops the sync from relinking.

## Gmail and Calendar sync (phase 3), serverless version
- Google OAuth with offline access; scopes gmail.readonly, calendar.events.readonly (read only: Soldlyne never sends or drafts mail). Encrypt tokens at rest, refresh when older than 55 min.
- One channel row per mailbox or calendar: cursor (Gmail historyId / Calendar syncToken), stage, stage_started_at, synced_at, failure_count, retry_after.
- First sync: messages.list limited to the last 90 days, excluding categories promotions/social/forums/updates, spam, trash. Then history.list from the cursor.
- A `sync_queue(channel_id, external_id)` table replaces Redis; pop batches with FOR UPDATE SKIP LOCKED.
- Vercel Cron every hour claims due channels; one Workflow run per channel; steps under 60 s.
- Filters: drop bulk mail (List-Unsubscribe, List-Id, Precedence bulk, Auto-Submitted), noreply/info/support/newsletter senders unless sent by me, internal-only threads, blocklisted handles or domains.
- Match participants case-insensitively on Person.emails; link the thread to the person, their company, and deals where they are the contact.
- Contact auto-creation policy: only people I have emailed (SENT), work addresses only, company by domain.
- Errors: Gmail 404 or Calendar 410 resets the cursor; invalid_grant marks the account for reconnect; 429/403/5xx exponential backoff, failed after 5.
- Later: Gmail Pub/Sub push and Calendar watch to trigger syncs sooner.

## UX
- Record page: fields panel on the left, timeline on the right (activities, notes, history).
- Board: columns are stages, cards move with drag and drop, column header shows count and total.
- Cmd+K search across companies, people and deals.
- "Last contact" computed from activities on every list.
- Twenty has no LinkedIn capture: the Chrome extension is ours to design (phase 4).
