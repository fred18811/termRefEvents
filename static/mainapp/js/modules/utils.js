'use strict';

export const getCSRFToken = () => {
    return document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
};

// Экранирование HTML
export const escapeHtml = (text) => {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
};

// Форматирование даты
export const formatDate = (dateStr) => {
    if (!dateStr) return 'Дата не указана';
    try {
        return new Date(dateStr).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
};

// Форматирование только даты (без времени)
export const formatDateOnly = (dateStr) => {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('ru-RU');
    } catch {
        return dateStr;
    }
};

// Показ уведомлений
export const showNotification = (message, type = 'info') => {
    const types = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const icon = types[type] || types.info;
    const notification = $(`
        <div class="notification ${type}">
            ${icon} ${message}
            <span class="modal-close" style="float:right;margin-left:1rem;cursor:pointer;">&times;</span>
        </div>
    `).appendTo('body').fadeIn(300);
    
    setTimeout(() => notification.fadeOut(300, () => notification.remove()), 4000);
    notification.find('.modal-close').click(() => notification.remove());
};

// Обновленная функция validateDates (принимает даты)
export const validateDates = (dateStart, dateEnd) => {
    if (!dateStart || !dateEnd) return { valid: false, error: 'Выберите даты' };
    
    const startDate = new Date(dateStart);
    const endDate = new Date(dateEnd);
    const now = new Date();
    
    if (startDate < now) {
        return { valid: false, error: 'Дата начала не может быть в прошлом' };
    }
    if (endDate <= startDate) {
        return { valid: false, error: 'Дата окончания должна быть позже даты начала' };
    }
    
    return { valid: true };
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========

export const initDateStartPicker = () => {
    const dateStartInput = document.getElementById('dateStart');
    if (!dateStartInput) {
        console.error('Элемент dateStart не найден');
        return;
    }
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    dateStartPicker = flatpickr(dateStartInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        disable: [getDisabledDatesFunction()],
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            // ... существующий код ...
        },
        onChange: async (selectedDates, dateStr, instance) => {
            if (isUpdating) return;
            if (selectedDates && selectedDates.length > 0 && state.currentLocation && currentLocationIsEvent) {
                const dateEnd = $('#dateEnd').val();
                if (dateEnd) {
                    await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                    await updateEquipmentList();
                }
            }
        }
    });
};

// Установка минимальной даты
export const setMinDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const min = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    $('#dateStart, #dateEnd').attr('min', min);
};

// Debounce для оптимизации частых вызовов
export const debounce = (func, delay = 300) => {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
};

// Throttle для ограничения частоты вызовов
export const throttle = (func, limit = 300) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// Проверка занятости дат (через API)
export const checkDateTimeBusy = async (locationId, dateStart, dateEnd) => {
    try {
        const response = await $.ajax({
            url: '/api/check-datetime-busy/',
            method: 'GET',
            data: {
                location_id: locationId,
                date_start: dateStart,
                date_end: dateEnd
            }
        });
        return response;
    } catch (error) {
        console.error('Ошибка проверки занятости дат:', error);
        return { busy: false, partially_busy: false };
    }
};

// Получение занятых временных слотов
export const getBusyTimeSlots = async (locationId) => {
    try {
        const response = await $.ajax({
            url: '/api/get-busy-time-slots/',
            method: 'GET',
            data: { location_id: locationId }
        });
        return response.success ? response.slots : [];
    } catch (error) {
        console.error('Ошибка загрузки занятых слотов:', error);
        return [];
    }
};

// Проверка, занята ли конкретная дата
export const isDateTimeBusy = (dateTime, busySlots, isStart = true) => {
    if (!busySlots?.length) return false;
    
    const checkDate = new Date(dateTime);
    
    for (const slot of busySlots) {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);
        
        if (isStart) {
            if (checkDate >= slotStart && checkDate < slotEnd) return true;
        } else {
            if (checkDate > slotStart && checkDate <= slotEnd) return true;
        }
    }
    return false;
};