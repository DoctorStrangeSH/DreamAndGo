# Chat V2 — legacy conversation migration plan

Status: **READ-ONLY INSPECTOR IMPLEMENTED — NOT EXECUTED AGAINST FIRESTORE**

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

- [x] Implemented `server/scripts/chat-migration-inventory.js` to enumerate user chat summaries and every `chats/{chatId}/messages/{messageId}` collection through Firebase Admin read operations only.
- [x] The inspector distinguishes Chat V2 collections by their parent `schemaVersion`, skips known group-chat collections, and reports orphan legacy message collections without guessing participants.
- [x] `_init` is ignored only when it has no `partnerId`; malformed or unexpected summaries are reported.
- [x] Group summaries (`isGroup: true`) and their message collections are excluded from the private-chat migration scope and reported separately.
- [x] Legacy message collections without a corresponding valid summary pair are reported as orphans for manual review; no participant IDs are inferred from ambiguous legacy IDs.
- [x] Candidate pairs are derived from reciprocal `summary.partnerId` documents and exact path checks.
- [x] Legacy chat IDs are recomputed from sorted UIDs; underscore-based collisions are detected and block a clean result.
- [x] Canonical V2 IDs use the exact SHA-256/NUL algorithm used by the server.
- [x] Message metadata, byte sizes, senders, IDs, timestamps, flags, duplicate IDs and malformed fields are inspected; plaintext is represented only by hashes and lengths.
- [x] Deterministic JSON manifest and Markdown report are generated locally; the tool contains no Firestore write/update/delete calls.
- [x] CLI refuses the known production project `dream-and-go`, requires `--confirm-non-production`, and requires an exact `CHAT_MIGRATION_ALLOWED_PROJECT_ID` allowlist match.
- [ ] Run against a separately provisioned staging project after credentials and its exact project ID are explicitly supplied.

### Phase B — backup and dry-run

- [x] Added a pure backup builder that encodes Firestore Timestamp, Date, bytes, GeoPoint and DocumentReference values into explicit tagged JSON; unknown value types fail closed.
- [x] Added per-document SHA-256 and byte counts, a source-inventory hash binding, a deterministic manifest, and a whole-bundle checksum.
- [x] Added a verifier that detects altered content, duplicate paths, path/ID mismatches, size/count mismatches, and invalid manifest/bundle checksums.
- [x] Added synthetic unit tests for type preservation, determinism, tamper detection, invalid paths and unsupported values.
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


### Inspector invocation (staging only)

The CLI is intentionally not run by CI and is not configured with production credentials. After a separate staging Firebase project and read-only credentials are available:

```bash
CHAT_MIGRATION_ALLOWED_PROJECT_ID=<exact-staging-project-id> \\
  node server/scripts/chat-migration-inventory.js \\
  --project-id <exact-staging-project-id> \\
  --output-dir ./private-chat-inventory-<run-id> \\
  --confirm-non-production
```

The output directory contains `legacy-chat-manifest.json` and `legacy-chat-report.md`. Keep it private: the manifest contains participant UIDs and source document paths, but no message plaintext.


### Inventory coverage note — 2026-11-23

The read-only inspector's total `messageDocuments` count includes both messages in validated participant pairs and messages in orphan collections. `pairedMessageDocuments` and `orphanMessageDocuments` are reported separately so totals cannot silently omit orphaned records. The manifest remains private because it contains participant UIDs, document paths, and message metadata/hashes.


### Exact-HEAD CI verification — 2026-11-23

- [x] `checks.yml` passed on commit `6073403dd65000a97d28752bbe9758c3c443e2d9` (run [45155314269](https://github.com/DoctorStrangeSH/DreamAndGo/actions/runs/45155314269)).
- [x] Root Unit suite: 163 passed, 0 failed.
- [x] Real Chromium offline-outbox suite: 4 passed, 0 failed.
- [x] Auth + Firestore Emulator suite: 23 passed, 0 failed.
- [x] Syntax validation: all 95 JavaScript files passed.
- [ ] Staging inventory remains unexecuted: no separate staging project ID or credentials have been provided.


### Backup implementation boundary — 2026-11-23

The new `server/chat-migration-backup.js` is a tested pure builder/verifier only. It does not read Firestore, write backup files, or restore documents. The actual staging export CLI remains blocked until a separate staging project and read-only credentials are supplied. Synthetic tests are not evidence of a real backup.


### Read-only backup export CLI — 2026-11-23

- [x] Added `server/scripts/chat-migration-backup.js` to read the staging chat summary and message collections, build the inventory from the same read snapshot, and create a checksummed backup bundle plus inventory/report files.
- [x] Export requires the exact `CHAT_MIGRATION_ALLOWED_PROJECT_ID`, explicit `--confirm-non-production`, and refuses the known production project through the shared safety guard.
- [x] Output directory must be new; directory/file permissions are restricted to owner access where supported; output files use exclusive creation and must never be committed because they contain private message text.
- [x] Export includes all user chat summary documents and all root chat message documents in the backup, while the private-chat inventory separately excludes verified Chat V2 and group records from legacy migration candidates.
- [x] Exact-HEAD CI and synthetic CLI safety tests passed on commit `496b968e` (174 unit tests, 4 Chromium tests, 23 Emulator tests, syntax check across 99 JavaScript files).
- [ ] No real staging export has been run; no staging project ID or credentials have been supplied.


### V2 summary exclusion and backup CLI safety — 2026-11-23

- [x] Inventory now identifies existing Chat V2 summaries by the exact canonical SHA-256 participant ID plus matching `chatId`, and skips them rather than treating them as legacy partner-ID documents.
- [x] Added regression coverage proving canonical V2 summaries produce zero legacy candidate pairs.
- [x] Added CLI preflight tests for help, production-project refusal, and mandatory non-production confirmation; these checks run before Firebase initialization.
- [x] Backup export output must be outside the repository, uses a new directory and owner-only permissions, and includes a private backup plus inventory/report.
- [x] Exact-HEAD CI passed on commit `496b968e`; subsequent parent-document completeness change is awaiting its own CI run.


### Final CI trigger for backup CLI hardening — 2026-11-23

The full test pipeline is being rerun after the backup CLI, V2-summary exclusion and process-level safety tests were added. No real Firebase export has been invoked.


### Backup CLI follow-up fix — 2026-11-23

- [x] Removed template-literal escaping entirely from the backup CLI to avoid source-generation ambiguity.
- [x] Corrected report and error output statements and verified the committed source contains no stray interpolation markers or escaped template delimiters.
- [x] Full CI passed on corrected exact HEAD `496b968e`.


### Backup completeness refinement — 2026-11-23

- [x] CI on `496b968e` passed: 174/174 unit tests, 4/4 real Chromium tests, 23/23 Firebase Emulator tests, and syntax validation for 99 JavaScript files.
- [x] Backup exporter now reads every root `chats/{chatId}` parent document, including chats with no messages, and includes these parent records in the checksummed bundle. This preserves metadata needed for complete review and restore.
- [ ] CI for this latest parent-document inclusion change is pending.
- [ ] Real staging export, backup read-back and dry run remain pending staging project access.


### Final validation trigger — 2026-11-23

The previous CI run was cancelled by subsequent documentation commits. The latest code change includes all root chat parent documents in the checksummed export. This commit intentionally triggers one final full pipeline on the reconciled branch HEAD; no Firebase export is started by CI.


### Backup self-verification gate — 2026-11-23

- [x] Exact-HEAD CI passed on `60fc4587`: 174 unit tests, 4 real Chromium tests, 23 Auth/Firestore Emulator tests, syntax validation across 99 JavaScript files.
- [x] Backup export now verifies every document checksum, manifest checksum and bundle checksum in memory before creating the output directory or writing any backup files; export aborts closed if verification fails.
- [x] Report explicitly identifies summaries, root chat parent documents and messages, and records a PASS self-verification line.
- [ ] Exact-HEAD CI for this additional self-verification gate is pending.
- [ ] Real staging export and independent restore/read-back test remain pending staging access.


### Backup exporter safety regression test — 2026-11-23

- [x] Added a process-suite source guard requiring checksum self-verification before output-directory creation.
- [x] Added a source guard ensuring the exporter contains no Firestore `.set()`, `.update()`, `.delete()` or `.create()` calls.
- [ ] Exact-HEAD CI for the final exporter self-verification and read-only guards is pending.


### Read-only regression guard refinement — 2026-11-23

- [x] CI on `746a586e` exposed a false positive in the static Firestore-write guard: it matched the in-memory `Map.set()` used to group messages, not a Firestore write.
- [x] Narrowed the guard to Firestore document write calls chained from Firestore references (`db` / `document.ref`), preserving the read-only requirement without rejecting ordinary in-memory maps.
- [x] Added offline backup read-back verifier and three synthetic tests for valid archives, tampered content, and mismatched inventory linkage.
- [ ] Full CI on the latest branch HEAD is pending.
- [ ] Real staging export and restore rehearsal remain blocked until a dedicated staging project is available.


### Offline verification hardening — 2026-11-23

- [x] Fixed the static read-only regression guard false positive: in-memory `Map.set()` is no longer confused with Firestore document writes.
- [x] Added offline backup read-back tests using synthetic data: valid bundle, tampered message, mismatched inventory linkage, and tampered inventory manifest.
- [x] Offline verifier now recomputes the inventory manifest SHA-256 from its actual contents, not merely compares a copied checksum field.
- [ ] Exact-HEAD CI after these changes is pending.
- [ ] Staging backup and restore rehearsal remain pending a dedicated non-production Firebase project.


### Final exact-HEAD validation trigger — 2026-11-23

All code and regression tests for offline backup read-back, inventory-manifest checksum verification, and Firestore read-only enforcement are now committed. Earlier runs were superseded by subsequent commits; this documentation-only commit triggers one consolidated CI run on the final branch HEAD. No Firebase export is run by CI.


Final validation note: consolidated CI must run against the current branch HEAD after all offline verifier and inventory checksum changes; no live Firebase export is part of this workflow.

### Backup restore implementation — 2026-11-23

- [x] Added a controlled decoder for tagged Timestamp, Date, Bytes, GeoPoint, and DocumentReference values. Firestore constructors and the target database are injected; importing the backup module does not initialize Firebase.
- [x] Reserved the `__firestoreType` key in source objects, made the restore decoder reject unknown tags and extra/missing tag fields, and preserved special object keys without prototype mutation.
- [x] Added unit coverage for valid tagged values and malformed/unknown tags.
- [x] Added a Firestore Emulator integration test using synthetic records, JSON serialization/read-back, native Firestore value restoration, nested document paths, source/target value re-encoding checks, and idempotent replay with stable document counts.
- [x] Bound the standalone read-only inventory CLI manifest to its explicit Firebase project ID.
- [ ] Run the new Emulator restore test and full Checks workflow on the exact HEAD.
- [ ] This is a synthetic restore test only; no live staging backup has been restored and no migration has been executed.

### Inventory output path safety — 2026-11-23

- [x] Inventory CLI now rejects filesystem roots and output directories inside the server working tree before Firebase initialization or any report writes.
- [x] Added a process-level regression test proving an in-repository output path is rejected before credential lookup.
- [ ] Exact-HEAD unit, syntax, and Emulator CI remain pending.
- [ ] No staging export or migration was executed.

### Symlink-safe migration output paths — 2026-11-23

- [x] Centralized Inventory/Backup output-path validation in `server/chat-migration-paths.js`.
- [x] Resolve the repository root from the CLI module location rather than the caller's current working directory.
- [x] Reject filesystem roots, repository descendants, and external symlink paths whose real target resolves inside the repository.
- [x] Added isolated tests for repository paths, symlink traversal, and valid external destinations.
- [ ] Exact-HEAD Unit, syntax, and Emulator CI remain pending.
- [ ] No Firebase staging export, restore, or migration was executed.

### Offline verifier regression coverage — 2026-11-23

- [x] Added `server/chat-migration-backup-verify.test.js` to the root `npm test` command; it was previously omitted from the workflow's unit-test entry point.
- [x] Corrected the verifier test fixture to include the same explicit staging project ID in the Inventory manifest that the Backup binds to.
- [ ] Exact-HEAD CI execution is still unconfirmed. The workflow file is configured for pushes to this integration branch, but the available commit-run lookup only exposes pull-request-triggered runs.
- [ ] No live Firebase export, restore, or migration was executed.
