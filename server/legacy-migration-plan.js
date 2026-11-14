import { createHash } from 'node:crypto';
import { auditLegacyChatSnapshot } from '../js/core/legacy-chat-audit.js';
import { conversationPairKey } from './chat-pair.js';

// Pure dry-run plan. There is deliberately no Firebase Admin import and no writes.
export function buildLegacyChatMigrationPlan(snapshot) {
    const audit = auditLegacyChatSnapshot(snapshot);
    const sourceById = new Map(snapshot.legacyChats.filter(row => row && typeof row.id === 'string')
        .map(row => [row.id, row]));
    const candidates = [];
    const held = [...audit.needsReview.map(row => ({
        sourceChatId: row.chatId, members: row.members, reasons: row.reasons
    }))];

    for (const row of audit.safePairs) {
        const source = sourceById.get(row.chatId);
        const reasons = [];
        if (!Number.isSafeInteger(source?.messageCount) || source.messageCount < 0) {
            reasons.push('message_count_not_verified');
        }
        if (!Array.isArray(source?.senderIds)) {
            reasons.push('sender_list_not_verified');
        }
        // Counts and sender list alone do NOT establish individual message integrity.
        if (reasons.length) {
            held.push({ sourceChatId: row.chatId, members: row.members, reasons });
            continue;
        }
        candidates.push({
            sourceChatId: row.chatId,
            sourceMessageCount: source.messageCount,
            members: row.members,
            targetPairKey: conversationPairKey(...row.members),
            // Assigned only after approved server-side creation, never inferred from legacy ID.
            targetChatId: null,
            status: 'requires_backup_and_integrity_verification'
        });
    }

    const inputFingerprint = createHash('sha256')
        .update(JSON.stringify(snapshot), 'utf8').digest('hex');
    return {
        kind: 'dreamandgo-chat-migration-dry-run-v1',
        inputFingerprint,
        executable: false,
        candidates: candidates.sort((a, b) => a.sourceChatId.localeCompare(b.sourceChatId)),
        held: held.sort((a, b) => a.sourceChatId.localeCompare(b.sourceChatId)),
        globalBlockers: [
            ...(audit.issues.length ? ['audit_issues_require_resolution'] : []),
            ...(held.length ? ['unverified_or_ambiguous_conversations'] : []),
            'production_rules_not_verified',
            'external_backup_and_restore_not_verified',
            'message_level_hashes_and_timestamps_not_verified',
            'legacy_writes_not_quiesced',
            'server_side_migration_and_rollback_not_implemented'
        ],
        requiredStages: [
            'export_full_snapshot_and_backup',
            'verify_both_participants_and_all_message_hashes',
            'create_target_mapping_transactionally',
            'copy_messages_preserving_original_metadata',
            'compare_message_counts_hashes_authors_and_order',
            'switch_clients_with_rollback_window',
            'retire_legacy_writes_only_after_verification'
        ],
        summary: {
            candidateCount: candidates.length,
            heldCount: held.length,
            auditIssueCount: audit.issues.length,
            sourceCount: audit.summary.totalLegacyChats
        }
    };
}
