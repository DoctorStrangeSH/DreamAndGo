import { escapeHTML, safeCount } from '../../core/security.js';
import { LevelService, LEVEL_CONFIG } from '../../services/level.service.js';

export class LevelWidget {
    constructor() {
        this.levelService = new LevelService();
    }

    async render() {
        const userId = window.app.currentUser?.uid;
        if (!userId) return '';

        const levelData = await this.levelService.getUserLevel(userId);
        const level = safeCount(levelData.level, 1000);
        const progress = safeCount(levelData.progress, 100);
        const xp = safeCount(levelData.xp, 1000000000);
        const levelInfo = this.levelService.getLevelInfo(level);

        return `
        <div class="level-widget" onclick="window.app.router.navigate('achievements')" title="Уровень ${level} — ${escapeHTML(levelInfo.title)} (нажми чтобы посмотреть достижения)">
            <div class="level-badge" style="background: ${levelInfo.color};">
                <span class="level-number">${levelData.level}</span>
            </div>
            <div class="level-progress-wrapper">
                <div class="level-title">${escapeHTML(levelInfo.title)}</div>
                <div class="level-bar">
                    <div class="level-bar-fill" style="width: ${progress}%; background: ${levelInfo.color};"></div>
                </div>
                <div class="level-xp">${xp} XP</div>
            </div>
        </div>
    `;
    }

    async showLevelUp(level) {
        const levelInfo = this.levelService.getLevelInfo(level);
        window.app.ui.showToast(
            `🎉 Новый уровень! ${escapeHTML(levelInfo.title)} (${level})`,
            'success'
        );
    }
}