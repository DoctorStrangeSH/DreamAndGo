// Pure routing policy for the opt-in registration recovery pilot.
export function recoveryRouteRedirect({ pending, signedIn, path }) {
    if (pending === true && signedIn === true && path !== 'recovery') return 'recovery';
    if (pending !== true && path === 'recovery') return 'home';
    return null;
}
