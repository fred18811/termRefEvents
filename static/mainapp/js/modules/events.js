import { state, loadCart } from './state.js';
import { formatDate, formatDate2, setMinDateTime, showNotification, validateDates } from './utils.js';
import { setupAjax } from './api.js';
import { updateCartDisplay, saveSingleOrder, saveMultipleOrders } from './cart.js';
import { loadLocationPhoto, updateEquipmentList, addToCart } from './location.js';
import { loadOrders, selectAllOrders, deselectAllOrders, exportOrdersToExcel, initOrderFilters } from './orders.js';
import { loadRooms, filterRooms } from './rooms.js';
import { showConfirm, closeModals } from './modal.js';

// ========== ПЕРЕМЕННЫЕ ==========
let busyDates = new Set();
let dateStartPicker = null;
let dateEndPicker = null;
let rentalDateStartPicker = null;
let rentalDateEndPicker = null;
let isUpdating = false;
let currentLocationIsEvent = false;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Инициализация дат в зависимости от типа помещения
const initDatePickersForLocation = (isEvent) => {
    if (isEvent) {
        // Для мероприятий - скрываем блок аренды
        $('#rentalDatesBlock').hide();
        $('.date-section .date-hint').text('Выберите даты мероприятия');
    } else {
        // Для обычных помещений - показываем блок аренды
        $('#rentalDatesBlock').show();
        $('.date-section .date-hint').text('Даты мероприятия не используются для этого помещения');
    }
};

// Получение текущих выбранных дат (только из видимой формы)
const getSelectedDates = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    
    if (mode === 'slots') {
        // В режиме "Слоты" используем даты из блока слотов
        return {
            date_start: $('#slotDateStart').val(),
            date_end: $('#slotDateEnd').val()
        };
    } else {
        // В режиме "Мероприятие" используем основной блок дат
        return {
            date_start: $('#dateStart').val(),
            date_end: $('#dateEnd').val()
        };
    }
};

// Получение дат для проверки занятости (только из видимой формы)
const getDatesForBusyCheck = () => {
    if ($('#rentalDatesBlock').is(':visible')) {
        return {
            date_start: $('#rentalDateStart').val(),
            date_end: $('#rentalDateEnd').val()
        };
    } else {
        return {
            date_start: $('#dateStart').val(),
            date_end: $('#dateEnd').val()
        };
    }
};

// Проверка, выбраны ли даты в видимой форме
const areDatesSelected = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    
    if (mode === 'slots') {
        return $('#slotDateStart').val() && $('#slotDateEnd').val();
    } else {
        return $('#dateStart').val() && $('#dateEnd').val();
    }
};

// Валидация дат в зависимости от типа помещения
const validateDatesByType = () => {
    let dateStart, dateEnd;
    
    if (currentLocationIsEvent) {
        dateStart = $('#dateStart').val();
        dateEnd = $('#dateEnd').val();
    } else {
        dateStart = $('#rentalDateStart').val();
        dateEnd = $('#rentalDateEnd').val();
    }
    
    if (!dateStart || !dateEnd) {
        return { valid: false, error: 'Сначала выберите даты' };
    }
    
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

// Валидация дат из видимой формы
const validateVisibleDates = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    let dateStart, dateEnd;
    
    if (mode === 'slots') {
        dateStart = $('#slotDateStart').val();
        dateEnd = $('#slotDateEnd').val();
        
        if (!dateStart || !dateEnd) {
            return { valid: false, error: 'Сначала выберите даты слота' };
        }
    } else {
        dateStart = $('#dateStart').val();
        dateEnd = $('#dateEnd').val();
        
        if (!dateStart || !dateEnd) {
            return { valid: false, error: 'Сначала выберите даты мероприятия' };
        }
    }
    
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

// Инициализация календарей для дат аренды
const initRentalDatePickers = () => {
    const rentalDateStartInput = document.getElementById('rentalDateStart');
    const rentalDateEndInput = document.getElementById('rentalDateEnd');
    
    if (!rentalDateStartInput || !rentalDateEndInput) {
        console.error('Элементы дат аренды не найдены');
        return;
    }
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    rentalDateStartPicker = flatpickr(rentalDateStartInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        disable: [() => false], // Не блокируем никакие даты
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            // Не добавляем подсветку занятых дат
        },
        onChange: async (selectedDates, dateStr, instance) => {
            // При изменении дат аренды НЕ проверяем занятость
            if (isUpdating) return;
            if (selectedDates && selectedDates.length > 0 && state.currentLocation) {
                // Просто обновляем список оборудования (без проверки занятости)
                await updateEquipmentList();
            }
        }
    });
    
    rentalDateEndPicker = flatpickr(rentalDateEndInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        disable: [() => false], // Не блокируем никакие даты
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            // Не добавляем подсветку занятых дат
        },
        onChange: async (selectedDates, dateStr, instance) => {
            if (isUpdating) return;
            if (selectedDates && selectedDates.length > 0 && state.currentLocation) {
                await updateEquipmentList();
            }
        }
    });
};

// Очистка подсветки занятых дат
const clearBusyHighlight = () => {
    $('#dateStart, #dateEnd').removeClass('busy');
    $('.busy-warning').remove();
    $('#dateError').hide();
};

// Включение/выключение полей дат (теперь они всегда включены)
const initDateFields = () => {
    const dateStartInput = document.getElementById('dateStart');
    const dateEndInput = document.getElementById('dateEnd');
    const rentalDateStartInput = document.getElementById('rentalDateStart');
    const rentalDateEndInput = document.getElementById('rentalDateEnd');
    
    if (dateStartInput) dateStartInput.disabled = false;
    if (dateEndInput) dateEndInput.disabled = false;
    if (rentalDateStartInput) rentalDateStartInput.disabled = false;
    if (rentalDateEndInput) rentalDateEndInput.disabled = false;
};

// Загрузка занятых дат с сервера
const loadBusyDates = async () => {
    // Если активен блок аренды (is_event = false), не загружаем занятые даты
    if ($('#rentalDatesBlock').is(':visible')) {
        console.log('Блок аренды активен, загрузка занятых дат пропущена');
        return;
    }
    
    if (!state.currentLocation) {
        console.log('Нет выбранной локации');
        return;
    }
    
    try {
        const response = await $.ajax({
            url: '/api/get-busy-dates/',
            method: 'GET',
            data: {
                location_id: state.currentLocation.id
            },
            dataType: 'json'
        });
        
        if (response && response.success) {
            busyDates.clear();
            if (response.dates && Array.isArray(response.dates)) {
                response.dates.forEach(date => {
                    if (date && typeof date === 'string') {
                        busyDates.add(date);
                    }
                });
            }
            console.log('Загружено занятых дат:', busyDates.size);
            
            if (dateStartPicker) {
                dateStartPicker.set('disable', [getDisabledDatesFunction()]);
                dateStartPicker.redraw();
            }
            if (dateEndPicker) {
                dateEndPicker.set('disable', [getDisabledDatesFunction()]);
                dateEndPicker.redraw();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки занятых дат:', error);
    }
};

// Функция определения заблокированных дат (НЕ БЛОКИРУЕМ, только подсвечиваем)
const getDisabledDatesFunction = () => {
    return (date) => {
        // НЕ блокируем никакие даты, возвращаем false
        // Чтобы можно было выбрать любую дату
        return false;
    };
};

// Проверка занятости помещения
const checkLocationBusy = async (locationId, locationName) => {
    // Если активен блок аренды (is_event = false), не проверяем занятость
    if ($('#rentalDatesBlock').is(':visible')) {
        console.log('Блок аренды активен, проверка занятости пропущена');
        return true;
    }
    
    // Получаем даты из основного блока
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    
    if (!dateStart || !dateEnd) {
        return true;
    }
    
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
        
        if (response.busy) {
            const confirmBusy = confirm(
                `⚠️ ВНИМАНИЕ!\n\nПомещение "${locationName}" уже занято на выбранные даты.\n\n` +
                `Дата начала: ${new Date(dateStart).toLocaleString('ru-RU')}\n` +
                `Дата окончания: ${new Date(dateEnd).toLocaleString('ru-RU')}\n\n` +
                `Вы всё равно хотите выбрать это помещение?`
            );
            
            if (!confirmBusy) {
                return false;
            }
            
            showNotification(`⚠️ Помещение "${locationName}" занято на выбранные даты`, 'warning');
        } else if (response.partially_busy) {
            showNotification(`⚠️ Часть оборудования в "${locationName}" занята на выбранные даты`, 'warning');
        }
        
        return true;
        
    } catch (error) {
        console.error('Ошибка проверки занятости:', error);
        showNotification('Ошибка проверки доступности помещения', 'error');
        return false;
    }
};

// Валидация и проверка занятости дат (без блокировки)
const validateAndCheckDates = async () => {
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    
    if (!dateStart || !dateEnd) return true;
    
    const startDate = new Date(dateStart);
    const endDate = new Date(dateEnd);
    const now = new Date();
    
    if (startDate < now) {
        showNotification('Дата начала не может быть в прошлом', 'error');
        return false;
    }
    
    if (endDate <= startDate) {
        showNotification('Дата окончания должна быть позже даты начала', 'error');
        return false;
    }
    
    // Проверяем, есть ли занятые даты в выбранном диапазоне (только для предупреждения)
    let hasBusy = false;
    let currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    while (currentDate <= endDateTime) {
        if (currentDate >= today) {
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            if (busyDates.has(dateStr)) {
                hasBusy = true;
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (hasBusy && state.currentLocation) {
        $('#dateStart, #dateEnd').addClass('busy');
        $('#dateError').show();
    } else {
        $('#dateStart, #dateEnd').removeClass('busy');
        $('#dateError').hide();
    }
    
    // Всегда возвращаем true, чтобы можно было выбрать любые даты
    return true;
};

// Обработчик выбора локации
const handleLocationSelect = async (locationId, locationName, isEvent) => {
    // Сохраняем тип помещения
    currentLocationIsEvent = isEvent;
    
    // Проверяем, выбраны ли даты в видимой форме
    if (!areDatesSelected()) {
        showNotification('Сначала выберите даты', 'warning');
        return false;
    }
    
    // Валидация дат из видимой формы
    const dateValid = validateVisibleDates();
    if (!dateValid.valid) {
        showNotification(dateValid.error, 'error');
        return false;
    }
    
    // Проверяем занятость помещения (только для мероприятий)
    const isAvailable = await checkLocationBusy(locationId, locationName);
    
    if (!isAvailable) return false;
    
    // Снимаем активный класс со всех локаций
    $('.location-item').removeClass('active');
    // Добавляем активный класс выбранной локации
    $(`.location-item[data-id="${locationId}"]`).addClass('active');
    
    state.currentLocation = { id: locationId, name: locationName, is_event: isEvent };
    
    // Настраиваем отображение блока аренды в зависимости от типа помещения
    initDatePickersForLocation(isEvent);
    
    // Загружаем фото
    loadLocationPhoto(locationId);
    
    // Загружаем занятые даты для календаря (только для мероприятий)
    await loadBusyDates();
    
    // Обновляем список оборудования
    await updateEquipmentList();
    
    return true;
};

// ========== ИНИЦИАЛИЗАЦИЯ КАЛЕНДАРЕЙ ==========

const initDateStartPicker = () => {
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
        disable: [getDisabledDatesFunction()], // Не блокируем даты
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            try {
                if (dayElem && dayElem.dateObj) {
                    const dateObj = dayElem.dateObj;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    if (dateObj >= today) {
                        const year = dateObj.getFullYear();
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const day = String(dateObj.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;
                        
                        if (busyDates.has(dateStr)) {
                            dayElem.classList.add('busy-day');
                            dayElem.title = 'Дата занята (можно выбрать, но помещение будет занято)';
                        }
                    }
                }
            } catch (e) {}
        },
        onChange: async (selectedDates, dateStr, instance) => {
            if (isUpdating) return;
            if (selectedDates && selectedDates.length > 0) {
                const dateEnd = $('#dateEnd').val();
                if (dateEnd) {
                    await validateAndCheckDates();
                }
                if (state.currentLocation && dateEnd) {
                    await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                    updateEquipmentList();
                }
            }
        }
    });
};

// Инициализация переключателя режимов
const initModeToggle = () => {
    const toggleBtn = document.getElementById('modeToggleBtn');
    if (!toggleBtn) return;
    
    // Получаем сохранённый режим из localStorage
    const savedMode = localStorage.getItem('viewMode') || 'event';
    
    // Устанавливаем режим
    setMode(savedMode);
    
    // Обработчик клика
    toggleBtn.addEventListener('click', () => {
        const currentMode = toggleBtn.classList.contains('event-mode') ? 'event' : 'slots';
        const newMode = currentMode === 'event' ? 'slots' : 'event';
        setMode(newMode);
    });
};

// Обновление даты окончания на основе выбранного интервала
const updateEndDateByInterval = () => {
    const startDateStr = $('#slotDateStart').val();
    if (!startDateStr) return;
    
    const intervalMinutes = parseInt($('#slotInterval').val(), 10);
    if (isNaN(intervalMinutes)) return;
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(startDate.getTime() + intervalMinutes * 60000);
    
    // Форматируем дату для поля
    const year = endDate.getFullYear();
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const day = String(endDate.getDate()).padStart(2, '0');
    const hours = String(endDate.getHours()).padStart(2, '0');
    const minutes = String(endDate.getMinutes()).padStart(2, '0');
    const seconds = String(endDate.getSeconds()).padStart(2, '0');
    
    const formattedEndDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    $('#slotDateEnd').val(formattedEndDate);
    document.getElementById('slotDateEnd').nextSibling.value = formatDate2(formattedEndDate);
    
    // Если есть выбранная локация, обновляем оборудование
    if (state.currentLocation) {
        updateEquipmentList();
    }
};

// Установка режима
const setMode = (mode) => {
    const toggleBtn = document.getElementById('modeToggleBtn');
    if (!toggleBtn) return;
    
    const modeText = toggleBtn.querySelector('.mode-text');
    const modeIcon = toggleBtn.querySelector('.mode-icon');
    const slotsDatesBlock = document.getElementById('slotsDatesBlock');
    const intervalSelectorBlock = document.getElementById('intervalSelectorBlock');
    
    if (mode === 'event') {
        toggleBtn.classList.remove('slots-mode');
        toggleBtn.classList.add('event-mode');
        modeText.textContent = 'Мероприятие';
        modeIcon.textContent = '🎯';
        localStorage.setItem('viewMode', 'event');
        
        // Скрываем блок дат слотов и селектор интервала
        if (slotsDatesBlock) slotsDatesBlock.style.display = 'none';
        if (intervalSelectorBlock) intervalSelectorBlock.style.display = 'none';
        
        // Сбрасываем даты слотов
        $('#slotDateStart, #slotDateEnd').val('');
        
    } else {
        toggleBtn.classList.remove('event-mode');
        toggleBtn.classList.add('slots-mode');
        modeText.textContent = 'Слоты';
        modeIcon.textContent = '⏰';
        localStorage.setItem('viewMode', 'slots');
        
        // Показываем селектор интервала и блок дат слотов
        if (intervalSelectorBlock) intervalSelectorBlock.style.display = 'flex';
        if (slotsDatesBlock) slotsDatesBlock.style.display = 'flex';
        
        // Автоматически подставляем даты из основного блока
        const mainDateStart = $('#dateStart').val();
        const mainDateEnd = $('#dateEnd').val();
        
        if (mainDateStart) {
            document.getElementById('slotDateStart').nextSibling.value = formatDate2(mainDateStart);
            $('#slotDateStart').val(mainDateStart);
        }

        updateEndDateByInterval();
    }
    
    // НЕ скрываем .date-section - он всегда видим
    // Сбрасываем ошибку дат
    $('#dateError').hide();
    $('.date-input').removeClass('busy');
};

const initDateEndPicker = () => {
    const dateEndInput = document.getElementById('dateEnd');
    if (!dateEndInput) {
        console.error('Элемент dateEnd не найден');
        return;
    }
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    dateEndPicker = flatpickr(dateEndInput, {
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
                const dateStart = $('#dateStart').val();
                if (dateStart) {
                    await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                    await updateEquipmentList();
                }
            }
        }
    });
};

// Инициализация календарей для режима "Слоты"
const initSlotDatePickers = () => {
    const slotDateStartInput = document.getElementById('slotDateStart');
    const slotDateEndInput = document.getElementById('slotDateEnd');
    
    if (!slotDateStartInput || !slotDateEndInput) return;
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    flatpickr(slotDateStartInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        onChange: async () => {
            if (state.currentLocation && areDatesSelected()) {
                await updateEquipmentList();
            }
        }
    });
    
    flatpickr(slotDateEndInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        onChange: async () => {
            if (state.currentLocation && areDatesSelected()) {
                await updateEquipmentList();
            }
        }
    });
};

// Инициализация всех календарей
const initAllDatePickers = () => {
    initDateStartPicker();
    initDateEndPicker();
    initRentalDatePickers();
    initSlotDatePickers(); 
    initDateFields();
};

// ========== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ ==========
export const initEventHandlers = () => {
    console.log('Инициализация обработчиков событий');
    
    setupAjax();
    
    // Инициализируем все календари
    initAllDatePickers();
    
    // По умолчанию: основной блок дат ВСЕГДА ВИДЕН, блок аренды скрыт
    $('#rentalDatesBlock').hide();
    
    // Поля дат активны
    initDateFields();

    // Переключение страниц
    $('[data-page]').click(function(e) {
        e.preventDefault();
        const page = $(this).data('page');
        
        $('#mainPage, #ordersPage, #roomsPage').hide();
        
        if (page === 'main') {
            $('#mainPage').show();
            $('[data-page]').removeClass('active');
            $(this).addClass('active');
            updateCartDisplay();
        } else if (page === 'orders') {
            $('#ordersPage').show();
            $('[data-page]').removeClass('active');
            $(this).addClass('active');
            loadOrders();
            setTimeout(() => {
                if (typeof initOrderFilters === 'function') {
                    initOrderFilters();
                }
            }, 100);
        }
    });
    
    // Обработка галереи
    $('[data-gallery]').click(function(e) {
        e.preventDefault();
        const galleryType = $(this).data('gallery');
        
        if (galleryType === 'rooms') {
            $('#mainPage, #ordersPage, #roomsPage').hide();
            $('#roomsPage').show();
            $('[data-page]').removeClass('active');
            loadRooms();
        } else if (galleryType === 'furniture') {
            showNotification('🪑 Галерея "Мебель" в разработке', 'info');
        } else if (galleryType === 'equipment') {
            showNotification('🔧 Галерея "Оборудование" в разработке', 'info');
        }
    });
    
    // Выбор локации (с проверкой дат)
    $('.location-item').click(async function() {
        const id = $(this).data('id');
        const name = $(this).data('name');
        const isEvent = $(this).data('is-event') === true; // Получаем тип помещения
        
        console.log('Выбрана локация:', id, name, 'isEvent:', isEvent);
        
        if (state.selectedLocations.has(id.toString())) {
            showNotification('⚠️ Это помещение уже добавлено в заказ', 'warning');
            return;
        }
        
        await handleLocationSelect(id, name, isEvent);
    });
    
    // Обработчик изменения дат
    $('#dateStart, #dateEnd').on('change', async function() {
        console.log('Даты изменены');
        
        const dateStart = $('#dateStart').val();
        const dateEnd = $('#dateEnd').val();
        
        if (dateStart && dateEnd) {
            const dateValid = validateDates();
            if (dateValid.valid) {
                if (state.currentLocation) {
                    await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                    await updateEquipmentList();
                } else {
                    showNotification('Теперь выберите помещение', 'info');
                }
            } else {
                $('#equipmentContainer').html(`<div class="info-message">⚠️ ${dateValid.error}</div>`);
            }
        } else {
            $('#equipmentContainer').html('<div class="info-message">📅 Выберите дату начала и окончания</div>');
        }
    });
    
    // Выбор типов оборудования
    $('.type-item input').change(async function() {
        const val = $(this).val();
        if ($(this).is(':checked')) {
            state.selectedTypes.add(val);
        } else {
            state.selectedTypes.delete(val);
        }
        
        console.log('Выбранные типы:', [...state.selectedTypes]);
        
        if (state.currentLocation) {
            const dateStart = $('#dateStart').val();
            const dateEnd = $('#dateEnd').val();
            if (dateStart && dateEnd) {
                await updateEquipmentList();
            }
        }
    });
    
    // Кнопка "Добавить в заказ"
    $('#addButton').click(() => {
        addToCart();
    });
    
    // Очистка ошибки при вводе названия заявки
    $('#applicationName').on('input', function() {
        $(this).removeClass('error');
    });
    
    // Кнопки для заказов
    $('#selectAllBtn').click(selectAllOrders);
    $('#deselectAllBtn').click(deselectAllOrders);
    $('#exportOrdersBtn').click(exportOrdersToExcel);
    $('#refreshOrdersBtn').click(loadOrders);
    
    // Поиск и сортировка помещений
    $('#searchRooms').on('input', filterRooms);
    $('#sortRooms').on('change', filterRooms);
    
    // Закрытие модальных окон
    $('.modal-close, .modal .btn-secondary').click(closeModals);
    $(window).click(e => {
        if ($(e.target).is('.modal')) closeModals();
    });
    
    bindCartButtons();

    // Обработчики для модального окна добавления оборудования
    $('#confirmAddEquipmentBtn').off('click').on('click', function() {
        console.log('Кнопка "Добавить" нажата');
        if (typeof window.addSelectedEquipment === 'function') {
            window.addSelectedEquipment();
        } else {
            import('./cart.js').then(module => {
                module.addSelectedEquipment();
            });
        }
    });

    $('#cancelAddEquipmentBtn, #addEquipmentModal .modal-close').off('click').on('click', function() {
        $('#addEquipmentModal').hide();
    });

    // Синхронизация дат: при изменении основных дат обновляем даты слотов
    $('#dateStart, #dateEnd').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        
        if (mode === 'slots') {
            const mainDateStart = $('#dateStart').val();
            const mainDateEnd = $('#dateEnd').val();
            
            if (mainDateStart) {
                $('#slotDateStart').val(mainDateStart);
                document.getElementById('slotDateStart').nextSibling.value = formatDate2(mainDateStart);
                // Автоматически пересчитываем дату окончания по интервалу
                updateEndDateByInterval();
            }
        }
    });

    // Обработчик изменения интервала
    $('#slotInterval').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        if (mode === 'slots') {
            updateEndDateByInterval();
        }
    });

    // Обработчик изменения даты начала слота
    $('#slotDateStart').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        if (mode === 'slots') {
            updateEndDateByInterval();
        }
    });
};

const syncSlotDatesWithMain = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    
    if (mode === 'slots') {
        const mainDateStart = $('#dateStart').val();
        const mainDateEnd = $('#dateEnd').val();
        
        if (mainDateStart) {
            $('#slotDateStart').val(mainDateStart);
        }
        if (mainDateEnd) {
            $('#slotDateEnd').val(mainDateEnd);
        }
    }
};

// ========== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==========
export const initApp = () => {
    console.log('Инициализация приложения');
    setMinDateTime();
    loadCart();
    updateCartDisplay();
    
    $('#mainPage').show();
    $('#ordersPage, #roomsPage').hide();
    
    initEventHandlers();
    initModeToggle();
    syncSlotDatesWithMain();
    
    console.log('Приложение инициализировано');
};

const bindCartButtons = () => {
    setTimeout(() => {
        const saveBtn = document.getElementById('saveOrderFromCartBtn');
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            newSaveBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                console.log('Кнопка сохранения нажата (чистый JS)');
                
                if (typeof window.saveSingleOrder === 'function') {
                    await window.saveSingleOrder();
                } else {
                    const module = await import('./cart.js');
                    await module.saveSingleOrder();
                }
            });
        }
        
        const clearBtn = document.getElementById('clearCartBtn');
        if (clearBtn) {
            const newClearBtn = clearBtn.cloneNode(true);
            clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
            
            newClearBtn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Кнопка очистки нажата (чистый JS)');
                if (confirm('Очистить всю корзину?')) {
                    if (typeof window.clearCartGlobal === 'function') {
                        window.clearCartGlobal();
                    } else {
                        import('./state.js').then(module => {
                            module.clearCart();
                            if (typeof window.updateCartDisplayGlobal === 'function') {
                                window.updateCartDisplayGlobal();
                            }
                        });
                    }
                }
            });
        }
    }, 100);
};