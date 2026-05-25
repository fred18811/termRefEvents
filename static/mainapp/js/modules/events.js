import { state, loadCart } from './state.js';
import { formatDate, formatDateTimeForDisplay, setMinDateTime, showNotification, validateDates } from './utils.js';
import { setupAjax } from './api.js';
import { updateCartDisplay, saveSingleOrder, initCart } from './cart/index.js';
import { loadLocationPhoto, updateEquipmentList, addToCart, handleLocationSelect } from './location.js';
import { loadOrders, selectAllOrders, deselectAllOrders, exportOrdersToExcel, initOrderFilters } from './orders.js';
import { loadRooms, filterRooms } from './rooms.js';
import { showConfirm, closeModals } from './modal.js';
import { 
    initSlotDatePickers, 
    toggleSlotsUI, 
    syncSlotDatesWithMain, 
    initSlotsHandlers,
    clearAllSlots,
    updateEndDateByInterval,
    removeSlot,
    displaySlotsList,
    addNewSlot,
    getAllSlots
} from './slots.js';

// Сделать глобальными
window.getAllSlots = getAllSlots;
window.clearAllSlots = clearAllSlots;

// ========== ПЕРЕМЕННЫЕ ==========
let busyDates = new Set();
let dateStartPicker = null;
let dateEndPicker = null;
let rentalDateStartPicker = null;
let rentalDateEndPicker = null;
let isUpdating = false;
let currentLocationIsEvent = false;

// ========== ЛИПКИЙ БЛОК ФИЛЬТРОВ ==========
let isSticky = false;

// Функция для инициализации sticky блока
const initStickyTypes = () => {
    const typesElement = document.querySelector('.type-items');
    if (!typesElement) return;
    
    // Находим родительский контейнер для определения позиции
    const equipmentHeader = document.querySelector('.equipment-header');
    if (!equipmentHeader) return;
    
    // Создаём элемент-заглушку
    const spacer = document.createElement('div');
    spacer.className = 'type-items-spacer';
    typesElement.parentNode.insertBefore(spacer, typesElement);
    
    // Получаем позицию блока
    const getOffsetTop = () => {
        const rect = equipmentHeader.getBoundingClientRect();
        return rect.top + window.scrollY;
    };
    
    let offsetTop = getOffsetTop();
    
    // Функция проверки
    const checkSticky = () => {
        const scrollY = window.scrollY;
        const stickyTop = 80; // Отступ от верха
        
        if (scrollY + stickyTop > offsetTop && !isSticky) {
            // Прилипаем
            const rect = typesElement.getBoundingClientRect();
            typesElement.classList.add('sticky');
            typesElement.style.width = `${rect.width}px`;
            spacer.style.display = 'block';
            spacer.style.height = `${typesElement.offsetHeight}px`;
            isSticky = true;
        } else if (scrollY + stickyTop <= offsetTop && isSticky) {
            // Отлипаем
            typesElement.classList.remove('sticky');
            typesElement.style.width = '';
            spacer.style.display = 'none';
            isSticky = false;
        }
    };
    
    // Обновляем offsetTop при ресайзе
    const updateOffset = () => {
        offsetTop = getOffsetTop();
        if (isSticky) {
            checkSticky();
        }
    };
    
    window.addEventListener('scroll', checkSticky, { passive: true });
    window.addEventListener('resize', updateOffset);
    
    // Первоначальная проверка
    checkSticky();
};

// Форматирование даты для отображения
const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Инициализация дат в зависимости от типа помещения
export const initDatePickersForLocation = (isEvent) => {
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
export const getSelectedDates = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    
    if (mode === 'slots') {
        // Если есть слоты, используем даты первого слота для проверки?
        // Или возвращаем null, так как даты слота теперь в slotsList
        return {
            date_start: null,
            date_end: null
        };
    } else {
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
    const isEvent = state.currentLocation ? state.currentLocation.is_event : true;
    
    // Если режим "Слоты", используем даты слотов
    if (mode === 'slots') {
        return $('#slotDateStart').val() && $('#slotDateEnd').val();
    }
    
    // Для обычных помещений (аренда) - не требуем даты
    if (!isEvent) {
        return true;
    }
    
    // Для мероприятий - проверяем основной блок дат
    return $('#dateStart').val() && $('#dateEnd').val();
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
    const isEvent = state.currentLocation ? state.currentLocation.is_event : true;
    
    // Для режима "Слоты"
    if (mode === 'slots') {
        const dateStart = $('#slotDateStart').val();
        const dateEnd = $('#slotDateEnd').val();
        
        if (!dateStart || !dateEnd) {
            return { valid: false, error: 'Сначала выберите даты слота' };
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
    }
    
    // Для обычных помещений (аренда) - не валидируем даты
    if (!isEvent) {
        return { valid: true };
    }
    
    // Для мероприятий - валидируем основной блок дат
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    
    if (!dateStart || !dateEnd) {
        return { valid: false, error: 'Сначала выберите даты мероприятия' };
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
        disable: [() => false],
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            // Подсветка занятых дат (если нужно)
        },
        onChange: async (selectedDates, dateStr, instance) => {
            if (isUpdating) return;
            console.log('Flatpickr аренды: дата начала изменена');
            
            const dateStart = $('#rentalDateStart').val();
            const dateEnd = $('#rentalDateEnd').val();
            
            if (dateStart && dateEnd && state.currentLocation) {
                const isEvent = state.currentLocation.is_event;
                if (!isEvent) {
                    // Для аренды проверяем занятость
                    await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                    await updateEquipmentList();
                } else {
                    await updateEquipmentList();
                }
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
        disable: [() => false],
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            // Подсветка занятых дат (если нужно)
        },
        onChange: async (selectedDates, dateStr, instance) => {
            if (isUpdating) return;
            console.log('Flatpickr аренды: дата окончания изменена');
            
            const dateStart = $('#rentalDateStart').val();
            const dateEnd = $('#rentalDateEnd').val();
            
            if (dateStart && dateEnd && state.currentLocation) {
                const isEvent = state.currentLocation.is_event;
                if (!isEvent) {
                    // Для аренды проверяем занятость
                    await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                    await updateEquipmentList();
                } else {
                    await updateEquipmentList();
                }
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
export const loadBusyDates = async () => {
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
export const checkLocationBusy = async (locationId, locationName) => {
    // Получаем текущий режим
    const mode = localStorage.getItem('viewMode') || 'event';
    
    // Получаем тип помещения из DOM
    const locationItem = $(`.location-item[data-id="${locationId}"]`);
    const isEvent = locationItem.data('is-event') === true;
    
    console.log(`======= ПРОВЕРКА ЗАНЯТОСТИ =======`);
    console.log(`Помещение: ${locationName} (ID: ${locationId})`);
    console.log(`Тип: ${isEvent ? 'Мероприятие' : 'Аренда'}`);
    console.log(`Режим: ${mode}`);
    
    let dateStart, dateEnd;
    
    // ========== В РЕЖИМЕ "СЛОТЫ" ИСПОЛЬЗУЕМ ОБЩИЕ ДАТЫ ЛОКАЦИИ ==========
    if (mode === 'slots') {
        // Для слотов используем общие даты локации
        if (isEvent) {
            dateStart = $('#dateStart').val();
            dateEnd = $('#dateEnd').val();
            console.log(`Режим Слоты, Мероприятие: даты из основного блока`);
        } else {
            dateStart = $('#rentalDateStart').val();
            dateEnd = $('#rentalDateEnd').val();
            console.log(`Режим Слоты, Аренда: даты из блока аренды`);
        }
    } else {
        // Обычный режим (не Слоты)
        if (isEvent) {
            dateStart = $('#dateStart').val();
            dateEnd = $('#dateEnd').val();
            console.log(`Обычный режим, Мероприятие: даты из основного блока`);
        } else {
            dateStart = $('#rentalDateStart').val();
            dateEnd = $('#rentalDateEnd').val();
            console.log(`Обычный режим, Аренда: даты из блока аренды`);
        }
    }
    
    console.log(`Дата начала: ${dateStart}`);
    console.log(`Дата окончания: ${dateEnd}`);
    
    if (!dateStart || !dateEnd) {
        console.log('❌ Даты не выбраны');
        return true;
    }
    
    // Валидация дат
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
        
        console.log('Ответ API check-datetime-busy:', response);
        
        // Форматируем даты для отображения
        const startFormatted = new Date(dateStart).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const endFormatted = new Date(dateEnd).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        
        // Формируем информацию о занятых интервалах
        let busyInfo = '';
        if (response.busy_orders && response.busy_orders.length > 0) {
            busyInfo = '\n<i class="fa fa-file-text-o" aria-hidden="true"></i> Занято на:';
            response.busy_orders.forEach(order => {
                const orderStart = new Date(order.start).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                });
                const orderEnd = new Date(order.end).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                });
                busyInfo += `\n   • ${orderStart} - ${orderEnd}`;
                if (order.application_name) {
                    busyInfo += ` (${order.application_name})`;
                }
            });
        }
        
        if (response.busy) {
            showNotification(
                `<i class="fa fa-exclamation" aria-hidden="true"></i> Помещение "${locationName}" ЗАНЯТО`,
                'warning'
            );
        } else if (response.partially_busy) {
            showNotification(
                `<i class="fa fa-exclamation" aria-hidden="true"></i> Часть оборудования в "${locationName}" ЗАНЯТА`,
                'warning'
            );
        }
        
        return true;
        
    } catch (error) {
        console.error('Ошибка проверки занятости:', error);
        return true;
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

// ========== ИНИЦИАЛИЗАЦИЯ КАЛЕНДАРЕЙ ==========

const initDateStartPicker = () => {
    const dateStartInput = document.getElementById('dateStart');
    if (!dateStartInput) return;
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    dateStartPicker = flatpickr(dateStartInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',      // <-- ВАЖНО: без буквы T
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        onChange: async (selectedDates, dateStr, instance) => {
            // dateStr уже в нужном формате
            if (state.currentLocation) {
                await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                await updateEquipmentList();
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

// Установка режима (обновленная версия)
const setMode = (mode) => {
    const toggleBtn = document.getElementById('modeToggleBtn');
    if (!toggleBtn) return;
    
    const modeText = toggleBtn.querySelector('.mode-text');
    const modeIcon = toggleBtn.querySelector('.mode-icon');
    const modeIconFa = toggleBtn.querySelector('.mode-icon-fa');
    
    if (mode === 'event') {
        toggleBtn.classList.remove('slots-mode');
        toggleBtn.classList.add('event-mode');
        modeText.textContent = 'Мероприятие';
        modeIconFa.className = 'mode-icon-fa fa fa-linode';
        localStorage.setItem('viewMode', 'event');
        
        // Скрываем UI слотов
        toggleSlotsUI(false);
        
        // Очищаем слоты при переключении на мероприятие
        if (typeof clearAllSlots === 'function') {
            clearAllSlots();
        }
        
    } else {
        toggleBtn.classList.remove('event-mode');
        toggleBtn.classList.add('slots-mode');
        modeText.textContent = 'Слоты';
        modeIconFa.className = 'mode-icon-fa fa fa-clock-o';
        localStorage.setItem('viewMode', 'slots');
        
        // Очищаем слоты при переключении на слоты
        if (typeof clearAllSlots === 'function') {
            clearAllSlots();
        }
        
        // Показываем UI слотов
        toggleSlotsUI(true);
        
        // Автоматически подставляем даты из основного блока
        syncSlotDatesWithMain();
    }
    
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

    // Инициализация обработчиков слотов
    initSlotsHandlers();

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
            showNotification('<i class="fa fa-exclamation" aria-hidden="true"></i> Это помещение уже добавлено в заказ', 'warning');
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
                $('#equipmentContainer').html(`<div class="info-message"><i class="fa fa-exclamation" aria-hidden="true"></i> ${dateValid.error}</div>`);
            }
        } else {
            $('#equipmentContainer').html('<div class="info-message"><i class="fa fa-calendar"></i> Выберите дату начала и окончания</div>');
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
            syncSlotDatesWithMain();
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

    $('#addSlotBtn').off('click').on('click', function() {
        addNewSlot();
    });

    $('#rentalDateStart, #rentalDateEnd').on('change', async function() {
        console.log('Даты аренды изменены');
            
        const mode = localStorage.getItem('viewMode') || 'event';
        const dateStart = $('#rentalDateStart').val();
        const dateEnd = $('#rentalDateEnd').val();
            
        // Если есть выбранная локация и даты выбраны
        if (state.currentLocation && dateStart && dateEnd) {
            // Проверяем, является ли помещение арендой (is_event = false)
            const isEvent = state.currentLocation.is_event;
                
            if (!isEvent) {
                // Для аренды проверяем занятость
                console.log('Проверка занятости для аренды по датам:', dateStart, dateEnd);
                await checkLocationBusy(state.currentLocation.id, state.currentLocation.name);
                await updateEquipmentList();
            }
        } else if (dateStart && dateEnd) {
            console.log('Нет выбранной локации, только обновляем оборудование');
            if (state.currentLocation) {
                await updateEquipmentList();
            }
        }
    });
};


// ========== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==========
export const initApp = () => {
    setMinDateTime();
    loadCart();
    updateCartDisplay();
    initCart();
    
    $('#mainPage').show();
    $('#ordersPage, #roomsPage').hide();
    
    initEventHandlers();
    initModeToggle();
    initStickyTypes();
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