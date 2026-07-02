import { AuthService } from '../../services/auth.service.js';

export class AuthModule {
    constructor(authService) {
        this.authService = authService;
        this.mode = 'login';
    }

    render() {
        const appContainer = document.getElementById('app');
        appContainer.innerHTML = this.getTemplate();
        this.attachEventListeners();
    }

    getTemplate() {
        return `
            <div class="auth-container min-vh-100 d-flex align-items-center justify-content-center">
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-11 col-sm-8 col-md-6 col-lg-4">
                            <div class="text-center mb-4 fade-in-up">
                                <div class="auth-logo mb-3">
                                    <i class="bi bi-rocket-takeoff display-4 text-primary"></i>
                                </div>
                                <h1 class="fw-bold mb-2">Dream<span class="text-accent-warning">&</span>Go</h1>
                                <p class="text-muted">${this.mode === 'login' ? 'С возвращением!' : 'Создай свой мир мечты'}</p>
                            </div>

                            <div class="card-premium p-4 fade-in-up" style="animation-delay: 0.2s">
                                <form id="authForm" class="auth-form">
                                    <div class="mb-3">
                                        <label class="form-label fw-semibold">
                                            <i class="bi bi-envelope me-2"></i>Email
                                        </label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-transparent">
                                                <i class="bi bi-at"></i>
                                            </span>
                                            <input type="email" 
                                                   class="form-control" 
                                                   id="email" 
                                                   placeholder="your@email.com" 
                                                   required>
                                        </div>
                                    </div>

                                    ${this.mode === 'register' ? `
                                        <div class="mb-3">
                                            <label class="form-label fw-semibold">
                                                <i class="bi bi-person-badge me-2"></i>Никнейм
                                            </label>
                                            <div class="input-group">
                                                <span class="input-group-text bg-transparent">@</span>
                                                <input type="text" 
                                                       class="form-control" 
                                                       id="username" 
                                                       placeholder="your_nickname" 
                                                       minlength="3"
                                                       maxlength="20"
                                                       required>
                                            </div>
                                            <div class="form-text">
                                                <i class="bi bi-info-circle me-1"></i>
                                                От 3 до 20 символов, только буквы, цифры и _
                                            </div>
                                        </div>
                                    ` : ''}

                                    <div class="mb-3">
                                        <label class="form-label fw-semibold">
                                            <i class="bi bi-shield-lock me-2"></i>Пароль
                                        </label>
                                        <div class="input-group">
                                            <span class="input-group-text bg-transparent">
                                                <i class="bi bi-key"></i>
                                            </span>
                                            <input type="password" 
                                                   class="form-control" 
                                                   id="password" 
                                                   placeholder="Минимум 6 символов" 
                                                   minlength="6"
                                                   required>
                                            <button class="btn btn-outline-secondary" 
                                                    type="button" 
                                                    id="togglePassword">
                                                <i class="bi bi-eye"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <button type="submit" class="btn btn-premium w-100 mb-3">
                                        <i class="bi ${this.mode === 'login' ? 'bi-box-arrow-in-right' : 'bi-person-plus'} me-2"></i>
                                        ${this.mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                                    </button>

                                    <div class="text-center">
                                        <span class="text-muted">
                                            ${this.mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
                                        </span>
                                        <button type="button" class="btn btn-link text-decoration-none" id="toggleMode">
                                            ${this.mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div id="authError" class="alert alert-danger mt-3 d-none fade-in-up">
                                <i class="bi bi-exclamation-triangle me-2"></i>
                                <span id="authErrorMessage"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const togglePassword = document.getElementById('togglePassword');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const passwordInput = document.getElementById('password');
                const icon = document.querySelector('#togglePassword i');
                
                if (passwordInput && icon) {
                    if (passwordInput.type === 'password') {
                        passwordInput.type = 'text';
                        icon.className = 'bi bi-eye-slash';
                    } else {
                        passwordInput.type = 'password';
                        icon.className = 'bi bi-eye';
                    }
                }
            });
        }

        const toggleMode = document.getElementById('toggleMode');
        if (toggleMode) {
            toggleMode.addEventListener('click', () => {
                this.mode = this.mode === 'login' ? 'register' : 'login';
                this.render();
            });
        }

        const authForm = document.getElementById('authForm');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSubmit();
            });
        }
    }

    async handleSubmit() {
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        
        if (!emailInput || !passwordInput) return;
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        const submitBtn = document.querySelector('#authForm button[type="submit"]');
        if (!submitBtn) return;
        
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Загрузка...';
        submitBtn.disabled = true;

        let result;

        if (this.mode === 'login') {
            result = await this.authService.signInWithEmail(email, password);
        } else {
            const usernameInput = document.getElementById('username');
            if (!usernameInput) return;
            
            const username = usernameInput.value.trim();

            if (!this.validateUsername(username)) {
                this.showError('Никнейм должен содержать от 3 до 20 символов (буквы, цифры и _)');
                if (submitBtn) {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                }
                return;
            }

            result = await this.authService.signUpWithEmail(email, password, username);
        }

        if (result.success) {
            this.hideError();
        } else {
            this.showError(result.error);
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    }

    validateUsername(username) {
        const regex = /^[a-zA-Z0-9_]{3,20}$/;
        return regex.test(username);
    }

    showError(message) {
        const errorDiv = document.getElementById('authError');
        const errorMessage = document.getElementById('authErrorMessage');

        if (!errorDiv || !errorMessage) return;

        errorMessage.textContent = message;
        errorDiv.classList.remove('d-none');
    }

    hideError() {
        const errorDiv = document.getElementById('authError');
        if (errorDiv) {
            errorDiv.classList.add('d-none');
        }
    }
}