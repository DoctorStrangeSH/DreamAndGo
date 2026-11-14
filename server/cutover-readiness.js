// Review-only cutover readiness assessment. This module never switches clients,
// writes to Firebase, or treats emulator rehearsal as production evidence.
const REQUIRED = [
    'production_rules_review',
    'independent_backup',
    'restore_drill',
    'full_message_integrity',
    'legacy_write_freeze',
    'rollback_drill',
    'operator_approval'
];
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function assessChatCutoverReadiness({ plan, evidence, now } = {}) {
    if (plan?.kind !== 'dreamandgo-chat-migration-dry-run-v1' ||
        plan.executable !== false || !sha256(plan.inputFingerprint) ||
        !Array.isArray(plan.held) || !Array.isArray(plan.candidates)) {
        throw new TypeError('Expected safe dry-run plan');
    }
    if (!validTime(now)) throw new TypeError('Explicit review time is required');
    const issues = [];
    if (plan.held.length) issues.push('ambiguous_conversations');
    if (plan.candidates.length === 0) issues.push('no_reviewable_conversations');
    if (typeof evidence !== 'object' || !evidence || Array.isArray(evidence)) {
        evidence = {};
    }
    const seen = new Set();
    for (const type of REQUIRED) {
        const record = evidence[type];
        if (!record || record.kind !== type ||
            record.planFingerprint !== plan.inputFingerprint ||
            record.scope !== 'production' || record.reviewed !== true ||
            typeof record.reference !== 'string' || !record.reference.trim() ||
            !validTime(record.observedAt) || !validTime(record.expiresAt) ||
            Date.parse(record.observedAt) > Date.parse(now) ||
            Date.parse(record.expiresAt) <= Date.parse(now) ||
            Date.parse(record.expiresAt) <= Date.parse(record.observedAt)) {
            issues.push('missing_or_invalid_' + type);
        } else {
            seen.add(type);
        }
    }
    // Readiness is advisory: attestations are external review inputs, not proofs.
    return {
        kind: 'dreamandgo-chat-cutover-review-v1',
        planFingerprint: plan.inputFingerprint,
        reviewedControls: [...seen],
        issues,
        reviewReady: issues.length === 0,
        executable: false,
        productionSwitchEnabled: false,
        caveat: 'External attestations require independent human verification'
    };
}
