import { LevelService, LEVEL_CONFIG } from '../../services/level.service.js';

export class LevelWidget {
    constructor() {
        this.levelService = new LevelService();
    }

    async render() {
        const userId = window.app.currentUser?.uid;
        if (!userId) return '';

        const levelData = await this.levelService.getUserLevel(userId);
        const levelInfo = this.levelService.getLevelInfo(levelData.level);

        return `
        <div class="level-widget" onclick="window.app.router.navigate('achievements')" title="Уровень ${levelData.level} — ${levelInfo.title} (нажми чтобы посмотреть достижения)">
            <div class="level-badge" style="background: ${levelInfo.color};">
                <span class="level-number">${levelData.level}</span>
            </div>
            <div class="level-progress-wrapper">
                <div class="level-title">${levelInfo.title}</div>
                <div class="level-bar">
                    <div class="level-bar-fill" style="width: ${levelData.progress}%; background: ${levelInfo.color};"></div>
                </div>
                <div class="level-xp">${levelData.xp} XP</div>
            </div>
        </div>
    `;
    }

    async showLevelUp(level) {
        const levelInfo = this.levelService.getLevelInfo(level);
        window.app.ui.showToast(
            `🎉 Новый уровень! ${levelInfo.title} (${level})`,
            'success'
        );
    }
}