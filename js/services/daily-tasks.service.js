import { db } from '../config/firebase.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const ALL_TASKS = [
    { id: 'add_travel', title: 'Добавить путешествие', icon: 'bi-airplane', xp: 80, action: 'add_travel', target: 1 },
    { id: 'add_restaurant', title: 'Добавить ресторан', icon: 'bi-shop', xp: 60, action: 'add_restaurant', target: 1 },
    { id: 'add_movie', title: 'Посмотреть фильм', icon: 'bi-film', xp: 50, action: 'add_movie', target: 1 },
    { id: 'add_book', title: 'Добавить книгу', icon: 'bi-book', xp: 55, action: 'add_book', target: 1 },
    { id: 'add_dream', title: 'Записать мечту', icon: 'bi-star', xp: 45, action: 'add_dream', target: 1 },
    { id: 'rate_3', title: 'Оценить 3 любых элемента', icon: 'bi-star-fill', xp: 70, action: 'rate', target: 3 },
    { id: 'write_review', title: 'Написать рецензию', icon: 'bi-pencil', xp: 60, action: 'review', target: 1 },
    { id: 'add_friend', title: 'Добавить друга', icon: 'bi-person-plus', xp: 100, action: 'add_friend', target: 1 },
    { id: 'send_5_messages', title: 'Отправить 5 сообщений', icon: 'bi-chat', xp: 40, action: 'send_message', target: 5 },
];

export class DailyTasksService {
    constructor() {
        this.db = db;
    }

    async getTodayTasks(userId) {
        const today = new Date().toDateString();
        const taskRef = doc(this.db, 'users', userId, 'dailyTasks', 'current');
        const taskDoc = await getDoc(taskRef);

        if (taskDoc.exists() && taskDoc.data().date === today) {
            return taskDoc.data();
        }

        // Генерируем новые задания
        const shuffled = [...ALL_TASKS].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3).map(task => ({
            ...task,
            progress: 0,
            completed: false,
            claimed: false
        }));

        const newTasks = {
            date: today,
            tasks: selected,
            allCompleted: false,
            bonusClaimed: false
        };

        await setDoc(taskRef, newTasks);
        return newTasks;
    }

    async updateTaskProgress(userId, action) {
        const today = new Date().toDateString();
        const taskRef = doc(this.db, 'users', userId, 'dailyTasks', 'current');
        const taskDoc = await getDoc(taskRef);

        if (!taskDoc.exists()) return null;

        const data = taskDoc.data();
        if (data.date !== today) return null;

        let updated = false;
        data.tasks = data.tasks.map(task => {
            if (task.action === action && !task.completed) {
                task.progress += 1;
                if (task.progress >= task.target) {
                    task.completed = true;
                    updated = true;
                }
            }
            return task;
        });

        data.allCompleted = data.tasks.every(t => t.completed);

        if (updated) {
            await updateDoc(taskRef, { tasks: data.tasks, allCompleted: data.allCompleted });
        }

        return data;
    }

    async claimTaskReward(userId, taskId) {
        const taskRef = doc(this.db, 'users', userId, 'dailyTasks', 'current');
        const taskDoc = await getDoc(taskRef);
        if (!taskDoc.exists()) return null;

        const data = taskDoc.data();
        const task = data.tasks.find(t => t.id === taskId);
        
        if (!task || !task.completed || task.claimed) return null;

        task.claimed = true;
        await updateDoc(taskRef, { tasks: data.tasks });

        // Начисляем XP
        const { LevelService } = await import('./level.service.js');
        const levelService = new LevelService();
        await levelService.addXP(userId, task.action);

        return task.xp;
    }

    async claimBonusReward(userId) {
        const taskRef = doc(this.db, 'users', userId, 'dailyTasks', 'current');
        const taskDoc = await getDoc(taskRef);
        if (!taskDoc.exists()) return null;

        const data = taskDoc.data();
        if (!data.allCompleted || data.bonusClaimed) return null;

        data.bonusClaimed = true;
        await updateDoc(taskRef, { bonusClaimed: true });

        return 150;
    }

    getTimeUntilReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const diff = tomorrow - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}ч ${minutes}м`;
    }
}