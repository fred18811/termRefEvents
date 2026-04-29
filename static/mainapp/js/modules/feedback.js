import { api } from './api.js';
import { showNotification } from './utils.js';

// Инициализация обратной связи
export const initFeedback = () => {
    // Обработчик кнопки "Обратная связь"
    $('#feedbackBtn').off('click').on('click', function() {
        openFeedbackModal();
    });
    
    // Обработчик формы
    $('#feedbackForm').off('submit').on('submit', async function(e) {
        e.preventDefault();
        await sendFeedback();
    });
    
    // Обработчик кнопки отмены
    $('#cancelFeedbackBtn').off('click').on('click', function() {
        closeFeedbackModal();
    });
    
    // Обработчик закрытия модального окна
    $('#feedbackModal .modal-close').off('click').on('click', function() {
        closeFeedbackModal();
    });
    
    // Клик вне модального окна
    $(window).off('click.feedback').on('click.feedback', function(e) {
        if ($(e.target).is('#feedbackModal')) {
            closeFeedbackModal();
        }
    });
};

// Открытие модального окна обратной связи
const openFeedbackModal = () => {
    // Очищаем форму
    $('#feedbackName').val('');
    $('#feedbackComment').val('');
    $('#feedbackError').hide();
    // Показываем модальное окно
    $('#feedbackModal').show();
};

// Закрытие модального окна
const closeFeedbackModal = () => {
    $('#feedbackModal').hide();
};

// Отправка обратной связи
const sendFeedback = async () => {
    const name = $('#feedbackName').val().trim();
    const comment = $('#feedbackComment').val().trim();
    
    // Валидация
    if (!comment) {
        $('#feedbackError').text('Пожалуйста, введите текст сообщения').show();
        return;
    }
    
    // Блокируем кнопку отправки
    const submitBtn = $('#submitFeedbackBtn');
    const originalText = submitBtn.text();
    submitBtn.prop('disabled', true).text('Отправка...');
    $('#feedbackError').hide();
    
    try {
        const response = await api.sendFeedback(name, comment);
        
        if (response.success) {
            showNotification('✅ Спасибо за обратную связь! Ваше сообщение отправлено.', 'success');
            closeFeedbackModal();
        } else {
            $('#feedbackError').text(response.error || 'Ошибка при отправке').show();
        }
    } catch (error) {
        console.error('Ошибка отправки:', error);
        $('#feedbackError').text('Ошибка соединения с сервером. Попробуйте позже.').show();
    } finally {
        submitBtn.prop('disabled', false).text(originalText);
    }
};