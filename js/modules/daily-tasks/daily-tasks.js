import { DailyTasksService } from '../../services/daily-tasks.service.js';
import { escapeHTML } from '../../core/escape-html.js';

export class DailyTasksWidget {
    constructor() {
        this.dailyTasksService = new DailyTasksService();
        this.busy = false;
    }

    async render() {
        const userId = window.app.currentUser?.uid;
        if (!userId) return '';

        const data = await this.dailyTasksService.getTodayTasks(userId);
        if (!data || !Array.isArray(data.tasks)) return '';

        const completed = data.tasks.filter(task => task.completed).length;
        const timeLeft = this.dailyTasksService.getTimeUntilReset();
        const tasks = data.tasks.map(task => {
            const progress = Math.max(0, Math.min(task.target, task.progress));
            const percent = task.target > 0 ? Math.round(progress / task.target * 100) : 0;
            const status = task.claimed
                ? '<i class="bi bi-check-circle-fill text-success" title="Награда получена"></i>'
                : task.completed
                    ? `<button class="btn btn-success btn-sm claim-task-btn" data-task-id="${escapeHTML(task.id)}">Получить +${escapeHTML(String(task.xp))} XP</button>`
                    : `<small class="text-muted">${progress}/${escapeHTML(String(task.target))}</small>`;
            return `
                <div class="daily-task-item ${task.completed ? 'completed' : ''} ${task.claimed ? 'claimed' : ''} p-2 mb-2 rounded">
                    <div class="d-flex align-items-center gap-2">
                        <i class="bi ${escapeHTML(task.icon)} ${task.completed ? 'text-success' : 'text-muted'}"></i>
                        <div class="flex-grow-1 min-width-0">
                            <small class="fw-semibold">${escapeHTML(task.title)}</small>
                            <div class="progress" style="height: 3px;">
                                <div class="progress-bar ${task.completed ? 'bg-success' : ''}" style="width: ${percent}%"></div>
                            </div>
                        </div>
                        ${status}
                    </div>
                </div>
            `;
        }).join('');

        const bonus = data.allCompleted && !data.bonusClaimed
            ? '<button class="btn btn-warning btn-sm w-100 mt-2 claim-bonus-btn">🎁 Получить бонус +100 XP</button>'
            : data.bonusClaimed
                ? `<div class="small text-success text-center mt-2">Бонус получен: +${escapeHTML(String(data.bonusClaimedXp || 0))} XP</div>`
                : '';

        return `
            <div class="daily-tasks-widget dropdown">
                <button class="btn btn-icon position-relative" data-bs-toggle="dropdown" title="Ежедневные задания" aria-label="Ежедневные задания">
                    <i class="bi bi-list-check fs-5"></i>
                    ${completed > 0 ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-success" style="font-size: 0.5rem;">${completed}</span>` : ''}
                </button>
                <div class="dropdown-menu dropdown-menu-end p-3" style="width: 320px;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="fw-bold mb-0">📋 Ежедневные задания</h6>
                        <small class="text-muted">Сброс через ${timeLeft} (UTC)</small>
                    </div>
                    ${tasks}
                    ${bonus}
                    <div class="small text-muted text-center mt-2">Задания обновляются автоматически по UTC</div>
                </div>
            </div>
        `;
    }

    attachListeners() {
        const userId = window.app.currentUser?.uid;
        if (!userId || this.busy) return;

        document.querySelectorAll('.claim-task-btn').forEach(button => {
            button.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                if (this.busy) return;
                this.busy = true;
                button.disabled = true;
                try {
                    const result = await this.dailyTasksService.claimTaskReward(userId, button.dataset.taskId);
                    if (result?.claimed) {
                        window.app.ui.showToast(`Награда получена: +${result.xpGained} XP`);
                    }
                    this.busy = false;
                    await window.app.renderNavWidgets();
                } catch (error) {
                    const limited = error?.code === 'functions/resource-exhausted';
                    window.app.ui.showToast(limited ? 'Дневной лимит XP исчерпан. Попробуй завтра.' : 'Награда пока недоступна. Обнови задания и попробуй ещё раз.', 'warning');
                    button.disabled = false;
                } finally {
                    this.busy = false;
                }
            });
        });

        document.querySelectorAll('.claim-bonus-btn').forEach(button => {
            button.addEventListener('click', async event => {
                event.preventDefault();
                event.stopPropagation();
                if (this.busy) return;
                this.busy = true;
                button.disabled = true;
                try {
                    const result = await this.dailyTasksService.claimBonusReward(userId);
                    if (result?.claimed) {
                        window.app.ui.showToast(`Бонус получен: +${result.xpGained} XP`);
                    }
                    this.busy = false;
                    await window.app.renderNavWidgets();
                } catch (error) {
                    const limited = error?.code === 'functions/resource-exhausted';
                    window.app.ui.showToast(limited ? 'Дневной лимит XP исчерпан. Попробуй завтра.' : 'Бонус пока недоступен. Обнови задания и попробуй ещё раз.', 'warning');
                    button.disabled = false;
                } finally {
                    this.busy = false;
                }
            });
        });
    }
}
