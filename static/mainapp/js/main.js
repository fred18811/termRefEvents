
import { initApp } from './modules/events.js';
import { checkAuth, initAuth } from './modules/auth.js';
import { showNotification } from './modules/utils.js';
import { initFeedback } from './modules/feedback.js';

// Запуск приложения после проверки авторизации
$(document).ready(async function() {
    // Скрываем все страницы изначально
    $('#mainPage, #ordersPage, #roomsPage').hide();
    
    // Проверяем авторизацию
    const isAuthenticated = await checkAuth();
    
    if (isAuthenticated) {
        // Пользователь авторизован - запускаем приложение
        initApp();
        initFeedback();  // Инициализируем обратную связь
    } else {
        // Показываем форму авторизации
        initAuth();
    }
});

// Глобальная обработка 401 ошибок
$(document).ajaxError(function(event, xhr) {
    if (xhr.status === 401) {
        try {
            const response = JSON.parse(xhr.responseText);
            if (response.code === 'UNAUTHORIZED') {
                showNotification('Сессия истекла. Пожалуйста, войдите снова.', 'error');
                // Скрываем все страницы
                $('#mainPage, #ordersPage, #roomsPage').hide();
                initAuth();
            }
        } catch(e) {
            showNotification('Ошибка авторизации', 'error');
        }
    }
});