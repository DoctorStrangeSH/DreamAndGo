import { AchievementsService, ACHIEVEMENTS } from '../../services/achievements.service.js';

export class AchievementsModule {
    constructor() { this.achievementsService = new AchievementsService(); }

    async render() {
        const mc = document.getElementById('main-content'); if (!mc) return;
        const uid = window.app.currentUser?.uid; if (!uid) return;
        mc.innerHTML = window.app.ui.createLoader();
        const earned = await this.achievementsService.getUserAchievements(uid);
        const all = this.achievementsService.getAllAchievements();
        const stats = window.app.userData?.stats || {};
        mc.innerHTML = this.getTemplate(earned, all, stats);
        this.attachListeners();
    }

    getTemplate(earned, all, stats) {
        const totalEarned = earned.length;
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
                    return `<div class="col-12 col-md-6 achievement-item" data-category="${a.category}">
                        <div class="card-premium p-3 h-100 ${e?'achievement-earned':'achievement-locked'}">
                            <div class="d-flex align-items-center gap-3">
                                <div class="achievement-icon ${e?'earned':''}"><span>${a.emoji}</span></div>
                                <div class="flex-grow-1">
                                    <div class="d-flex justify-content-between"><div><h6 class="fw-bold mb-0">${e?e.title:a.title}</h6><p class="text-muted small mb-1">${e?e.description:a.description}</p></div>${e?'<span class="badge bg-success fs-6"><i class="bi bi-check-lg"></i></span>':''}</div>
                                    ${a.levels.length>1?`<div class="achievement-levels mt-1">${a.levels.map((l,i)=>`<span class="achievement-level-dot ${e&&e.level>i?'earned':''} ${e&&e.level===l.level?'current':''}">${e&&e.level>i?'⭐':'○'}</span>`).join('')}<small class="text-muted ms-1">Ур.${e?e.level:0}/${a.levels.length}</small></div>`:''}
                                    ${e?`<small class="text-muted"><i class="bi bi-calendar me-1"></i>${this.fdate(e.awardedAt)}</small>`:''}
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