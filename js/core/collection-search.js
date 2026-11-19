/**
 * Search and sort rendered personal-collection cards without another database read.
 * Cards keep their DOM nodes and attached event handlers when reordered.
 */
export function applyCollectionSearchAndSort({ document, gridId, cardSelector, emptyId, countId, query = '', order = 'recent' }) {
    const grid = document.getElementById(gridId);
    if (!grid) return { matches: 0, total: 0 };

    const cards = [...grid.querySelectorAll(cardSelector)];
    const sorted = [...cards].sort((a, b) => {
        const original = Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
        if (order === 'name') return a.dataset.name.localeCompare(b.dataset.name, 'ru') || original;
        if (order === 'rating') return Number(b.dataset.rating) - Number(a.dataset.rating) || original;
        return original;
    });
    for (const card of sorted) grid.appendChild(card);

    const needle = String(query).trim().toLocaleLowerCase();
    let matches = 0;
    for (const card of cards) {
        const visible = !needle || card.dataset.search.includes(needle);
        card.hidden = !visible;
        if (visible) matches++;
    }
    const empty = document.getElementById(emptyId);
    if (empty) empty.hidden = !needle || matches > 0 || cards.length === 0;
    const count = document.getElementById(countId);
    if (count) count.textContent = needle && cards.length ? `Найдено: ${matches} из ${cards.length}` : '';
    return { matches, total: cards.length };
}
