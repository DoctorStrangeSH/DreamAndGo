import { DailyTasksService } from '../../services/daily-tasks.service.js';

export class DailyTasksWidget {
    constructor() {
        this.dailyTasksService = new DailyTasksService();
    }

    async render() {
        const userId = window.app.currentUser?.uid;
        if (!userId) return '';

        const data = await this.dailyTasksService.getTodayTasks(userId);
        if (!data) return '';

        const completed = data.tasks.filter(t => t.completed).length;
        const timeLeft = this.dailyTasksService.getTimeUntilReset();

        return `
            <div class="daily-tasks-widget dropdown">
                <button class="btn btn-icon position-relative" data-bs-toggle="dropdown" title="Ежедневные задания">
                    <i class="bi bi-list-check fs-5"></i>
                    ${completed > 0 ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-success" style="font-size: 0.5rem;">${completed}</span>` : ''}
                </button>
                <div class="dropdown-menu dropdown-menu-end p-3" style="width: 320px;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="fw-bold mb-0">📋 Ежедневные задания</h6>
                        <small class="text-muted">Сброс через ${timeLeft}</small>
                    </div>
                    ${data.tasks.map(task => `
                        <div class="daily-task-item ${task.completed ? 'completed' : ''} ${task.claimed ? 'claimed' : ''} p-2 mb-2 rounded">
                            <div class="d-flex align-items-center gap-2">
                                <i class="bi ${task.icon} ${task.completed ? 'text-success' : 'text-muted'}"></i>
                                <div class="flex-grow-1">
                                    <small class="fw-semibold">${task.title}</small>
                                    <div class="progress" style="height: 3px;">
                                        <div class="progress-bar ${task.completed ? 'bg-success' : ''}" style="width: ${(task.progress / task.target) * 100}%"></div>
                                    </div>
                                </div>
                                ${task.completed && !task.claimed ? `
                                    <button class="btn btn-success btn-sm claim-task-btn" data-task-id="${task.id}">
                                        +${task.xp} XP
                                    </button>
                                ` : task.claimed ? `
                                    <i class="bi bi-check-circle-fill text-success"></i>
                                ` : `
                                    <small class="text-muted">${task.progress}/${task.target}</small>
                                `}
                            </div>
                        </div>
                    `).join('')}
                    ${data.allCompleted && !data.bonusClaimed ? `
                        <button class="btn btn-warning btn-sm w-100 mt-2 claim-bonus-btn">
                            🎁 Забрать бонус +150 XP
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    attachListeners() {
        document.querySelectorAll('.claim-task-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                const xp = await this.dailyTasksService.claimTaskReward(window.app.currentUser.uid, taskId);
                if (xp) {
                    window.app.ui.showToast(`+${xp} XP получено! ⭐`, 'success');
                    window.app.awardXP('daily_login');
                }
            });
        });

        document.querySelector('.claim-bonus-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const xp = await this.dailyTasksService.claimBonusReward(window.app.currentUser.uid);
            if (xp) {
                window.app.ui.showToast(`🎁 Бонус +${xp} XP!`, 'success');
            }
        });
    }
}