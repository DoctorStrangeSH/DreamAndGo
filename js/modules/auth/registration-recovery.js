import { isValidUsername } from '../../core/username.js';

// Candidate recovery screen, available only behind the signup v2 rollout.
// Does not inspect any private profile fields or accept a client-selected UID.
export class RegistrationRecoveryModule {
    constructor(authService, onComplete) {
        this.authService = authService;
        this.onComplete = onComplete;
    }

    render() {
        const container = document.getElementById('main-content');
        if (!container) return;
        const available = window.app?.registrationRecoveryStatus === 'needs-profile';
        container.innerHTML = `
            <section class="container py-5" aria-labelledby="recovery-title">
                <div class="card-premium mx-auto p-4 p-md-5" style="max-width:560px">
                    <div class="mb-3 fs-1 text-primary"><i class="bi bi-shield-check" aria-hidden="true"></i></div>
                    <h1 class="h3 fw-bold mb-3" id="recovery-title">Заверши создание аккаунта</h1>
                    <p class="text-muted">Твой вход подтверждён, но профиль ещё не завершён.
                        Не создавай новый аккаунт с тем же email.</p>
                    ${available ? `
                        <form id="recoveryForm">
                            <label class="form-label fw-semibold" for="recoveryUsername">Твой никнейм</label>
                            <div class="input-group mb-2">
                                <span class="input-group-text">@</span>
                                <input class="form-control" id="recoveryUsername" name="username"
                                    autocomplete="username" minlength="3" maxlength="20"
                                    pattern="[A-Za-z0-9_]{3,20}" required>
                            </div>
                            <p class="small text-muted">От 3 до 20 латинских букв, цифр или _.</p>
                            <button id="recoverySubmit" class="btn btn-premium w-100" type="submit">
                                Завершить регистрацию
                            </button>
                        </form>
                    ` : `
                        <div class="alert alert-warning" role="status">
                            Восстановление временно недоступно. Попробуй позже.
                        </div>
                    `}
                    <div id="recoveryError" class="alert alert-danger mt-3 d-none" role="alert"></div>
                    <button class="btn btn-link mt-3 px-0" id="recoverySignOut" type="button">
                        Выйти из аккаунта
                    </button>
                </div>
            </section>`;
        container.querySelector('#recoverySignOut')?.addEventListener('click', async () => {
            const signOutButton = container.querySelector('#recoverySignOut');
            const error = container.querySelector('#recoveryError');
            if (!signOutButton || signOutButton.disabled) return;
            signOutButton.disabled = true;
            signOutButton.setAttribute('aria-busy', 'true');
            try {
                await this.authService.signOut();
            } catch {
                if (error) {
                    error.textContent = 'Не удалось выйти из аккаунта. Проверь подключение и повтори попытку.';
                    error.classList.remove('d-none');
                }
            } finally {
                if (signOutButton.isConnected) {
                    signOutButton.disabled = false;
                    signOutButton.removeAttribute('aria-busy');
                }
            }
        });
        if (!available) return;
        container.querySelector('#recoveryForm')?.addEventListener('submit', async event => {
            event.preventDefault();
            const input = container.querySelector('#recoveryUsername');
            const error = container.querySelector('#recoveryError');
            const button = container.querySelector('#recoverySubmit');
            if (!input || !error || !button || button.disabled) return;
            const username = input.value.trim();
            if (!isValidUsername(username)) {
                error.textContent = 'Никнейм: 3–20 латинских букв, цифр или _.';
                error.classList.remove('d-none');
                input.focus();
                return;
            }
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            error.classList.add('d-none');
            try {
                const result = await this.authService.recoverRegistrationV2(username);
                if (!result?.success) {
                    error.textContent = result?.error || 'Не удалось восстановить аккаунт.';
                    error.classList.remove('d-none');
                    return;
                }
                await this.onComplete();
            } catch {
                error.textContent = 'Проверь подключение и попробуй ещё раз.';
                error.classList.remove('d-none');
            } finally {
                if (button.isConnected) {
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                }
            }
        });
    }
}
