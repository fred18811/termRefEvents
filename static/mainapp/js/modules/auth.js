import { showNotification } from './utils.js';

// Получение CSRF токена
const getCSRFToken = () => {
    return document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
};

// Роли пользователей
const USER_ROLES = {
    ADMIN: 'Администратор',
    MANAGER: 'Менеджер',
    USER: 'Пользователь'
};

// Проверка авторизации
export const checkAuth = async () => {
    try {
        const response = await fetch('/api/check-auth/', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        if (data.authenticated) {
            updateUserInfo(data.user);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        return false;
    }
};

// Обновление информации о пользователе
const updateUserInfo = (user) => {
    $('#userName').text(`${user.first_name || user.username}`);
    $('#userRole').text(getUserRole(user));
    $('#userInfo').show();
    
    // Скрываем все страницы
    $('#mainPage, #ordersPage, #roomsPage').hide();
    
    // Показываем только главную страницу
    $('#mainPage').show();
    
    // Убираем класс visible
    $('#mainPage, #ordersPage, #roomsPage').removeClass('visible');
    
    // Скрываем модальное окно авторизации
    $('#authModal').hide();
};

// Функция определения роли пользователя
const getUserRole = (user) => {
    if (user.is_superuser) return USER_ROLES.ADMIN;
    if (user.groups && user.groups.includes('Manager')) return USER_ROLES.MANAGER;
    return USER_ROLES.USER;
};

// Инициализация авторизации
export const initAuth = () => {
    // Показываем модальное окно
    $('#authModal').show();
    
    // Скрываем все страницы
    $('#mainPage, #ordersPage, #roomsPage').hide();
    $('#userInfo').hide();
    
    // Обработчик отправки формы
    $('#loginForm').off('submit').on('submit', async (e) => {
        e.preventDefault();
        
        const username = $('#username').val().trim();
        const password = $('#password').val();
        
        if (!username || !password) {
            $('#authError').text('Введите логин и пароль').show();
            return;
        }
        
        $('#authError').hide();
        $('#loginForm button').prop('disabled', true).text('Вход...');
        
        try {
            const response = await fetch('/api/login/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCSRFToken()
                },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification(`Добро пожаловать, ${data.user.username}!`, 'success');
                window.location.href = '/';
            } else {
                $('#authError').text(data.error || 'Ошибка авторизации').show();
                $('#loginForm button').prop('disabled', false).text('Войти');
            }
        } catch (error) {
            console.error('Ошибка авторизации:', error);
            $('#authError').text('Ошибка соединения с сервером').show();
            $('#loginForm button').prop('disabled', false).text('Войти');
        }
    });
};

// Выход из системы
export const logout = async () => {
    try {
        const response = await fetch('/api/logout/', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Вы вышли из системы', 'info');
            window.location.href = '/';
        } else {
            showNotification('Ошибка при выходе', 'error');
        }
    } catch (error) {
        console.error('Ошибка выхода:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
};

// Инициализация обработчика кнопки выхода
$(document).ready(function() {
    $('#logoutBtn').off('click').on('click', (e) => {
        e.preventDefault();
        logout();
    });
});