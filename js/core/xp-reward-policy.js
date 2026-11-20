export const XP_REWARDS = Object.freeze({
    travels: 50,
    restaurants: 30,
    movies: 20,
    books: 25,
    dreams: 15,
    friends: 40,
    complete_dream: 100
});

export const XP_DAILY_LIMIT = 300;
export const XP_DAILY_ACTION_LIMIT = 5;

export function isDreamCompletionTransition(before, after) {
    return before?.status !== 'completed' && after?.status === 'completed';
}
