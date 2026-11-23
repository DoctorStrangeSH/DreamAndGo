# Chat V2 — legacy conversation migration plan

Status: **DESIGN ONLY — NO DATA READ/WRITE OR MIGRATION HAS BEEN RUN**

This plan is a release gate for preserving existing private conversations while moving from the legacy chat schema to Chat V2. It does not authorize a production migration, deployment, Rules change, or rollout-gate change.

## 1. Confirmed schema from the current code

### Legacy source

- Conversation summaries: `users/{uid}/chats/{partnerUid}`.
- Legacy summary fields written by the current client: `partnerId`, `lastMessage`, `lastMessageTime`, `unread`, `createdAt`.
- Message collection: `chats/{legacyChatId}/messages/{messageId}`.
- Legacy chat ID: the two UIDs sorted lexicographically and joined with `_`.
- Legacy message fields: `senderId`, `text`, `createdAt`, `read`, `edited`, optional `editedAt`.

### Chat V2 target

- Canonical chat ID: SHA-256 of the two lexicographically sorted UIDs joined with a NUL separator.
- Chat document: `chats/{chatId}`, with `type: "private"`, `schemaVersion: 2`, and exactly two `participants`.
- Message collection: `chats/{chatId}/messages/{messageId}`.
- Per-user summaries: `users/{uid}/chats/{chatId}`, with `type: "private"`, `partnerId`, `partnerName`, `partnerAvatar`, `lastMessage`, `lastMessageTime`, and the user's own `unread` count.

## 2. Non-negotiable safety rules

1. Never mutate or delete legacy source summaries or messages during migration.
2. Never migrate directly from the browser. Use a reviewed Admin SDK script or a narrowly scoped server-side administrative process.
3. Do not run against production as part of development or CI.
4. Do not enable `chat-v2-enabled` merely because target documents exist.
5. Every execution must have an immutable migration run ID, source manifest, backup, dry-run report, and rollback manifest.
6. Fail closed on ambiguous participant pairs, malformed message IDs, unknown senders, invalid timestamps, duplicate/conflicting message IDs, or inconsistent reciprocal summaries.
7. Preserve original message IDs wherever valid; never silently rewrite message identity.
8. Do not derive a pair only by splitting the legacy chat ID on underscores. Firebase UIDs may contain underscores; discover pairs from reciprocal summary documents and verify the exact legacy ID against the sorted pair.

## 3. Migration phases

### Phase A — read-only inventory

- [ ] Enumerate `users/*/chats/*` summaries without changing data.
- [ ] Exclude known sentinel documents such as `_init` only after confirming their actual shape.
- [ ] Build candidate participant pairs from `summary.partnerId` and require a reciprocal summary.
- [ ] Compute the legacy chat ID from each validated pair and confirm that it matches the legacy source path.
- [ ] Compute the canonical V2 chat ID using the same SHA-256/NUL algorithm as the server.
- [ ] Enumerate messages and report counts, byte sizes, senders, ID validity, timestamp validity, duplicate IDs, and field-shape anomalies.
- [ ] Produce a deterministic JSON manifest and a human-readable report. Do not write Firestore documents.

### Phase B — backup and dry-run

- [ ] Export every source summary and message document, including document IDs and original field values, to a versioned local JSONL/JSON backup.
- [ ] Record a SHA-256 checksum per source document and a checksum for the complete manifest.
- [ ] Store the backup outside the Firebase project in an access-controlled location; verify it can be read back before proceeding.
- [ ] Produce a dry-run target plan showing target paths, transformed fields, skipped records, and conflicts.
- [ ] Confirm source counts and checksums are stable between inventory and backup.
- [ ] Require a second review of the report before any write is permitted.

### Phase C — staging rehearsal

- [ ] Use a separate Firebase staging project with disposable test accounts and representative legacy records.
- [ ] Execute in bounded batches with a migration-run marker on every created/updated target document.
- [ ] Create the V2 chat document and both per-user summaries transactionally where possible.
- [ ] Copy messages using original IDs and preserve `senderId`, `text`, `createdAt`, `read`, `edited`, and `editedAt`.
- [ ] Preserve each user's own unread count; do not copy one participant's count to the other.
- [ ] If a V2 target already exists, compare it with the planned result. Treat exact matches as idempotent success; stop on conflicts rather than overwrite newer V2 activity.
- [ ] Re-run the same migration and prove that the second run creates no duplicates and changes no already-migrated content.
- [ ] Compare source/target message counts and per-message checksums; report every mismatch.
- [ ] Test both participants, unrelated account access, block state, history pagination, and new messages after migration.

### Phase D — rollback rehearsal

- [ ] Roll back only target documents carrying the exact migration-run marker.
- [ ] Never delete or rewrite legacy source documents during rollback.
- [ ] Prove that rollback leaves pre-existing V2 documents and post-migration user activity untouched.
- [ ] Re-run integrity checks against the unchanged legacy source.

### Phase E — controlled rollout (separate approval required)

- [ ] Obtain explicit owner approval after the staging rehearsal and review.
- [ ] Deploy the required Functions and Rules separately from the data migration.
- [ ] Enable Chat V2 only for the approved staging cohort first.
- [ ] Keep legacy chat reads available until a separately approved retirement plan.
- [ ] Production rollout requires its own backup, dry-run, approval, monitoring window, and rollback decision.

## 4. Idempotency and conflict policy

- Migration identity is the canonical participant pair plus source message ID.
- Existing target message with identical immutable content is treated as already migrated.
- Existing target message with different sender, text, or timestamp is a hard conflict.
- New V2 messages written after the migration snapshot must never be overwritten by a later migration retry.
- A migration marker records the run ID and source checksum, but does not replace content verification.
- The source remains authoritative until a separate cutover decision is approved.

## 5. Acceptance evidence required

- [ ] Read-only inventory report and deterministic manifest.
- [ ] Verified backup and checksums.
- [ ] Dry-run report with zero unresolved conflicts.
- [ ] Staging rehearsal report with exact source/target counts and checksums.
- [ ] Idempotent second-run evidence.
- [ ] Rollback rehearsal evidence.
- [ ] Two-account browser acceptance.
- [ ] Explicit approval for any production action.

## 6. Current decision

**NOT READY TO MIGRATE.** The current work has verified the Chat V2 server and encrypted offline outbox, but no real legacy dataset has been inventoried or backed up. This document intentionally defines the safe sequence without performing it.
