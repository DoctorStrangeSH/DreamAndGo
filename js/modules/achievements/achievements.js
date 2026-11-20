import { AchievementsService, ACHIEVEMENTS } from '../../services/achievements.service.js';
import { escapeHTML } from '../../core/escape-html.js';

const MILESTONES = {
    first_travel: [{ travels: 1 }, { travels: 5 }, { travels: 15 }, { travels: 30 }],
    first_movie: [{ movies: 1 }, { movies: 10 }, { movies: 50 }, { movies: 100 }],
    first_restaurant: [{ restaurants: 1 }, { restaurants: 10 }, { restaurants: 25 }],
    first_book: [{ books: 1 }, { books: 10 }, { books: 25 }, { books: 50 }],
    first_dream: [{ dreams: 1 }, { dreams: 5 }, { dreamsCompleted: 3 }],
    first_friend: [{ friends: 1 }, { friends: 5 }, { friends: 15 }],
    collector: [{ travels: 1, restaurants: 1, movies: 1, books: 1, dreams: 1 }],
    perfect_week: [{ totalCollections: 7 }]
};

export function getAchievementMilestone(achievement, earnedLevel, stats = {}) {
    const requirements = MILESTONES[achievement.id] || [];
    const next = requirements[Math.max(0, earnedLevel)];
    if (!next) return null;
    const values = { ...stats, totalCollections: ['travels', 'restaurants', 'movies', 'books', 'dreams']
        .reduce((sum, key) => sum + Math.max(0, Number(stats[key]) || 0), 0) };
    const target = Object.values(next).reduce((sum, n) => sum + n, 0);
    const current = Object.entries(next).reduce((sum, [key, n]) => sum + Math.min(n, Math.max(0, Number(values[key]) || 0)), 0);
    return { current, target, percentage: Math.round(current / target * 100) };
}

export function getAchievementTier(level) {
    const safeLevel = Number.isFinite(Number(level)) ? Math.max(0, Math.floor(Number(level))) : 0;
    if (safeLevel >= 4) return { id: 'legendary', label: 'Легендарное' };
    if (safeLevel === 3) return { id: 'gold', label: 'Золотое' };
    if (safeLevel === 2) return { id: 'silver', label: 'Серебряное' };
    if (safeLevel === 1) return { id: 'bronze', label: 'Бронзовое' };
    return { id: 'locked', label: 'Не открыто' };
}

export class AchievementsModule {
    constructor() { this.achievementsService = new AchievementsService(); this.requestId = 0; }

    async render() {
        const mc = document.getElementById('main-content'); if (!mc) return;
        const uid = window.app.currentUser?.uid; if (!uid) return;
        const requestId = ++this.requestId;
        mc.innerHTML = `<div data-achievements-request="${requestId}">${window.app.ui.createLoader()}</div>`;
        const isCurrent = () => requestId === this.requestId && window.app.currentUser?.uid === uid &&
            mc.isConnected !== false && !!mc.querySelector(`[data-achievements-request="${requestId}"]`);
        try {
            const earned = await this.achievementsService.getUserAchievements(uid, { throwOnError: true });
            if (!isCurrent()) return;
            const all = this.achievementsService.getAllAchievements();
            const stats = window.app.userData?.stats || {};
            mc.innerHTML = this.getTemplate(earned, all, stats);
            this.attachListeners();
        } catch (error) {
            console.error('Не удалось загрузить достижения:', error);
            if (!isCurrent()) return;
            mc.innerHTML = `<section class="atlas-empty atlas-empty--achievement" role="alert">
                <h2>Не удалось загрузить достижения</h2>
                <p>Проверь подключение и попробуй снова. Награды сохранены.</p>
                <button type="button" class="btn btn-premium" data-retry-achievements>Повторить</button>
            </section>`;
            mc.querySelector('[data-retry-achievements]')?.addEventListener('click', () => this.render());
        }
    }

    getTemplate(earned, all, stats) {
        const totalEarned = all.reduce((sum, achievement) => {
            const level = Number(earned.find(item => item.id === achievement.id)?.level) || 0;
            return sum + Math.min(achievement.levels.length, Math.max(0, level));
        }, 0);
        const totalAll = all.reduce((s, a) => s + a.levels.length, 0);
        const cats = [{ id: 'all', name: 'Все', icon: 'bi-grid' }, { id: 'travels', name: 'Путешествия', icon: 'bi-airplane' }, { id: 'movies', name: 'Кино', icon: 'bi-film' }, { id: 'restaurants', name: 'Рестораны', icon: 'bi-shop' }, { id: 'books', name: 'Книги', icon: 'bi-book' }, { id: 'dreams', name: 'Мечты', icon: 'bi-star' }, { id: 'friends', name: 'Друзья', icon: 'bi-people' }, { id: 'special', name: 'Особые', icon: 'bi-trophy' }];

        return `<div class="fade-in-up">
            <div class="achievements-header mb-4">
                <h2 class="fw-bold mb-1"><i class="bi bi-trophy text-warning me-2"></i>Достижения</h2>
                <div class="d-flex align-items-center gap-3 mt-2">
                    <div class="progress flex-grow-1"><div class="progress-bar bg-warning" style="width:${totalAll>0?totalEarned/totalAll*100:0}%"></div></div>
                    <span class="fw-bold text-nowrap">${totalEarned} / ${totalAll}</span>
                </div>
            </div>
            <div class="mb-4"><div class="d-flex gap-1 flex-wrap" id="categoryFilters">${cats.map(c=>`<button class="btn btn-sm ${c.id==='all'?'btn-primary':'btn-outline-primary'}" data-category="${c.id}"><i class="bi ${c.icon} me-1"></i>${c.name}</button>`).join('')}</div></div>
            <div id="achievementsGrid" class="row g-3">
                ${all.map(a => {
                    const e = earned.find(x=>x.id===a.id);
                    const earnedLevel = Math.min(a.levels.length, Math.max(0, Number(e?.level) || 0));
                    const milestone = getAchievementMilestone(a, earnedLevel, stats);
                    const tier = getAchievementTier(earnedLevel);
                    return `<div class="col-12 col-md-6 achievement-item" data-category="${a.category}">
                        <div class="card-premium p-3 h-100 achievement-tier--${tier.id} ${e?'achievement-earned':'achievement-locked'}">
                            <div class="d-flex align-items-center gap-3">
                                <div class="achievement-icon ${e?'earned':''}"><span>${a.emoji}</span></div>
                                <div class="flex-grow-1">
                                    <div class="d-flex justify-content-between gap-2"><div><h6 class="fw-bold mb-0">${escapeHTML(e?.title || a.title)}</h6><p class="text-muted small mb-1">${escapeHTML(e?.description || a.description)}</p></div><span class="achievement-tier-badge achievement-tier-badge--${tier.id}">${tier.label}</span></div>
                                    ${a.levels.length>1?`<div class="achievement-levels mt-1">${a.levels.map((l,i)=>`<span class="achievement-level-dot ${earnedLevel>i?'earned':''} ${earnedLevel===l.level?'current':''}">${earnedLevel>i?'⭐':'○'}</span>`).join('')}<small class="text-muted ms-1">Ур.${earnedLevel}/${a.levels.length}</small></div>`:''}
                                    ${milestone?`<div class="mt-2"><div class="d-flex justify-content-between small text-muted mb-1"><span>До следующей награды</span><span>${milestone.current}/${milestone.target}</span></div><div class="progress" role="progressbar" aria-label="Прогресс достижения ${escapeHTML(a.title)}" aria-valuenow="${milestone.current}" aria-valuemin="0" aria-valuemax="${milestone.target}"><div class="progress-bar bg-warning" style="width:${milestone.percentage}%"></div></div></div>`:'<small class="text-success">Все уровни открыты!</small>'}
                                    ${e?`<small class="text-muted"><i class="bi bi-calendar me-1"></i>${escapeHTML(this.fdate(e.awardedAt))}</small>`:''}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    attachListeners() {
        document.querySelectorAll('#categoryFilters [data-category]').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('#categoryFilters [data-category]').forEach(x => { x.classList.remove('btn-primary'); x.classList.add('btn-outline-primary'); });
            b.classList.remove('btn-outline-primary'); b.classList.add('btn-primary');
            document.querySelectorAll('.achievement-item').forEach(item => {
                item.style.display = (b.dataset.category === 'all' || item.dataset.category === b.dataset.category) ? '' : 'none';
            });
        }));
    }

    fdate(d) { if(!d)return''; return new Date(d).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}); }
}
