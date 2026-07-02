export const APP_CONFIG = {
    name: 'Dream&Go',
    version: '2.0.0',
    
    // Cloudflare Worker
    CLOUDFLARE_WORKER_URL: 'https://tmdb-proxy.sokrat3895.workers.dev',
    
    TRAVEL_TYPES: [
        { id: 'city', icon: 'bi-building', label: 'Город' },
        { id: 'nature', icon: 'bi-tree', label: 'Природа' },
        { id: 'mountains', icon: 'bi-mountain', label: 'Горы' },
        { id: 'beach', icon: 'bi-water', label: 'Пляж' },
        { id: 'culture', icon: 'bi-bank', label: 'Культура' }
    ],

    CUISINE_TYPES: [
        'Итальянская', 'Японская', 'Русская', 'Французская',
        'Мексиканская', 'Китайская', 'Индийская', 'Грузинская'
    ],

    MOVIE_GENRES: {
        28: 'Боевик',
        12: 'Приключения',
        16: 'Мультфильм',
        35: 'Комедия',
        80: 'Криминал',
        99: 'Документальный',
        18: 'Драма',
        10751: 'Семейный',
        14: 'Фэнтези',
        36: 'История',
        27: 'Ужасы',
        10402: 'Музыка',
        9648: 'Детектив',
        10749: 'Мелодрама',
        878: 'Фантастика',
        10770: 'Телефильм',
        53: 'Триллер',
        10752: 'Военный',
        37: 'Вестерн'
    },

    ACHIEVEMENT_TYPES: [
        { id: 'first_travel', icon: 'bi-airplane', title: 'Первое путешествие', description: 'Добавить первое путешествие' },
        { id: 'foodie', icon: 'bi-egg-fried', title: 'Гурман', description: 'Добавить 10 ресторанов' },
        { id: 'movie_buff', icon: 'bi-film', title: 'Киноман', description: 'Посмотреть 50 фильмов' },
        { id: 'bookworm', icon: 'bi-book', title: 'Книжный червь', description: 'Прочитать 20 книг' }
    ]
};