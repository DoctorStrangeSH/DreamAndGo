const GRADIENTS = [
    'linear-gradient(135deg, #344b86 0%, #744bb4 100%)',
    'linear-gradient(135deg, #22546b 0%, #2f8f95 100%)',
    'linear-gradient(135deg, #563c7b 0%, #bb6684 100%)',
    'linear-gradient(135deg, #2b6a64 0%, #73a075 100%)',
    'linear-gradient(135deg, #5a4d8f 0%, #a16da7 100%)',
    'linear-gradient(135deg, #704c65 0%, #af7b60 100%)'
];

/** Same member ID always yields the same profile cover across page reloads. */
export function getProfileGradient(id) {
    const value = String(id ?? '');
    let hash = 0;
    for (const char of value) hash = (Math.imul(hash, 31) + char.codePointAt(0)) | 0;
    return GRADIENTS[(hash >>> 0) % GRADIENTS.length];
}
