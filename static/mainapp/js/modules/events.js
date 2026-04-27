import { state, loadCart } from './state.js';
import { setMinDateTime, showNotification, validateDates } from './utils.js';
import { setupAjax } from './api.js';
import { updateCartDisplay, saveSingleOrder, saveMultipleOrders } from './cart.js';
import { loadLocationPhoto, updateEquipmentList, addToCart } from './location.js';
import { loadOrders, selectAllOrders, deselectAllOrders, exportOrdersToExcel } from './orders.js';
import { loadRooms, filterRooms } from './rooms.js';
import { showConfirm, closeModals } from './modal.js';

// ========== ПЕРЕМЕННЫЕ ==========
let busyDates = new Set();
let dateStartPicker = null;
let dateEndPicker = null;
let isUpdating = false;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Очистка подсветки занятых дат
const clearBusyHighlight = () => {
    $('#dateStart, #dateEnd').removeClass('busy');
    $('.busy-warning').remove();
    $('#dateError').hide();
};

// Включение/выключение полей дат
const toggleDateFields = (enabled) => {
    console.log('toggleDateFields вызван с параметром:', enabled);
    
    const dateStartInput = document.getElementById('dateStart');
    const dateEndInput = document.getElementById('dateEnd');
    
    if (!dateStartInput || !dateEndInput) {
        console.error('Поля дат не найдены в DOM');
        return;
    }
    
    if (enabled) {
        dateStartInput.disabled = false;
        dateEndInput.disabled = false;
        
        if (dateStartInput.nextElementSibling) {
            dateStartInput.nextElementSibling.disabled = false;
        }
        if (dateEndInput.nextElementSibling) {
            dateEndInput.nextElementSibling.disabled = false;
        }
        
        $('.date-hint').text('Выберите дату и время');
        $('#dateError').hide();
        
        if (dateStartPicker) {
            dateStartPicker.redraw();
        }
        if (dateEndPicker) {
            dateEndPicker.redraw();
        }
    } else {
        dateStartInput.disabled = true;
        dateEndInput.disabled = true;
        
        if (dateStartInput.nextElementSibling) {
            dateStartInput.nextElementSibling.disabled = true;
        }
        if (dateEndInput.nextElementSibling) {
            dateEndInput.nextElementSibling.disabled = true;
        }
        
        $('.date-hint').text('Сначала выберите локацию');
        
        dateStartInput.value = '';
        dateEndInput.value = '';
        
        if (dateStartPicker) dateStartPicker.clear();
        if (dateEndPicker) dateEndPicker.clear();
    }
};

// Загрузка занятых дат с сервера
const loadBusyDates = async () => {
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

// Функция определения заблокированных дат
const getDisabledDatesFunction = () => {
    return (date) => {
        if (!date || !(date instanceof Date)) return false;
        try {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            return busyDates.has(dateStr);
        } catch (e) {
            return false;
        }
    };
};

// Проверка занятости дат (только для локационного оборудования)
const checkDateTimeBusyStatus = async () => {
    if (!state.currentLocation) return true;
    
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    
    if (!dateStart || !dateEnd) return true;
    
    try {
        const response = await $.ajax({
            url: '/api/check-datetime-busy/',
            method: 'GET',
            data: {
                location_id: state.currentLocation.id,
                date_start: dateStart,
                date_end: dateEnd
            }
        });
        
        clearBusyHighlight();
        
        if (response.busy) {
            $('#dateStart, #dateEnd').addClass('busy');
            const warningHtml = `<div class="busy-warning">⚠️ Локационное оборудование занято на выбранные даты</div>`;
            if (!$('.busy-warning').length) {
                $('.date-fields').append(warningHtml);
            }
            showNotification('Локационное оборудование занято на выбранные даты!', 'warning');
            return false;
        } else if (response.partially_busy) {
            const warningHtml = `<div class="busy-warning">⚠️ Часть локационного оборудования занята</div>`;
            if (!$('.busy-warning').length) {
                $('.date-fields').append(warningHtml);
            }
            showNotification('Часть локационного оборудования занята, доступное количество уменьшено', 'warning');
        }
        return true;
    } catch (error) {
        console.error('Ошибка проверки занятости дат:', error);
        return true;
    }
};

// Валидация и проверка занятости дат
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
    
    let hasBusy = false;
    let currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    while (currentDate <= endDateTime) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        if (busyDates.has(dateStr)) {
            hasBusy = true;
            break;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (hasBusy) {
        $('#dateStart, #dateEnd').addClass('busy');
        $('#dateError').show();
        showNotification('Выбранные даты заняты! Пожалуйста, выберите другие даты.', 'error');
        return false;
    } else {
        $('#dateStart, #dateEnd').removeClass('busy');
        $('#dateError').hide();
    }
    
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
        disable: [getDisabledDatesFunction()],
        onDayCreate: (dObj, dStr, fp, dayElem) => {
            try {
                if (dayElem && dayElem.dateObj) {
                    const year = dayElem.dateObj.getFullYear();
                    const month = String(dayElem.dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dayElem.dateObj.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}`;
                    if (busyDates.has(dateStr)) {
                        dayElem.classList.add('busy-day');
                        dayElem.title = 'Дата занята';
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
                    updateEquipmentList();
                }
            }
        }
    });
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
            try {
                if (dayElem && dayElem.dateObj) {
                    const year = dayElem.dateObj.getFullYear();
                    const month = String(dayElem.dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dayElem.dateObj.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}`;
                    if (busyDates.has(dateStr)) {
                        dayElem.classList.add('busy-day');
                        dayElem.title = 'Дата занята';
                    }
                }
            } catch (e) {}
        },
        onChange: async (selectedDates, dateStr, instance) => {
            if (isUpdating) return;
            if (selectedDates && selectedDates.length > 0) {
                const dateStart = $('#dateStart').val();
                if (dateStart) {
                    await validateAndCheckDates();
                }
                if (state.currentLocation && dateStart) {
                    updateEquipmentList();
                }
            }
        }
    });
};

// ========== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ ==========
export const initEventHandlers = () => {
    console.log('Инициализация обработчиков событий');
    
    setupAjax();
    
    initDateStartPicker();
    initDateEndPicker();
    
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
    
    // Выбор локации
    $('.location-item').click(async function() {
        const id = $(this).data('id');
        const name = $(this).data('name');
        
        console.log('Выбрана локация:', id, name);
        
        if (state.selectedLocations.has(id.toString())) {
            showNotification('⚠️ Эта локация уже добавлена в заказ', 'warning');
            return;
        }
        
        $('.location-item').removeClass('active');
        $(this).addClass('active');
        state.currentLocation = { id, name };
        
        toggleDateFields(true);
        await loadBusyDates();
        loadLocationPhoto(id);
        clearBusyHighlight();
        $('#equipmentContainer').html('<div class="info-message">📅 Выберите дату начала и окончания</div>');
    });
    
    // Обработчик изменения дат
    $('#dateStart, #dateEnd').on('change', async function() {
        console.log('Даты изменены');
        
        if (state.currentLocation) {
            const dateStart = $('#dateStart').val();
            const dateEnd = $('#dateEnd').val();
            
            if (dateStart && dateEnd) {
                const dateValid = validateDates();
                if (dateValid.valid) {
                    await checkDateTimeBusyStatus();
                    await updateEquipmentList();
                } else {
                    $('#equipmentContainer').html(`<div class="info-message">⚠️ ${dateValid.error}</div>`);
                }
            } else {
                $('#equipmentContainer').html('<div class="info-message">📅 Выберите дату начала и окончания</div>');
            }
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
    
    // Изначально поля дат отключены
    toggleDateFields(false);
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
    console.log('Приложение инициализировано');
};

const bindCartButtons = () => {
    // Небольшая задержка для гарантии, что DOM загружен
    setTimeout(() => {
        // Кнопка сохранения заказа
        const saveBtn = document.getElementById('saveOrderFromCartBtn');
        if (saveBtn) {
            // Удаляем старые обработчики
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            newSaveBtn.addEventListener('click', async function(e) {
                e.preventDefault();
                console.log('Кнопка сохранения нажата (чистый JS)');
                
                if (typeof window.saveSingleOrder === 'function') {
                    await window.saveSingleOrder();
                } else {
                    // Динамический импорт
                    const module = await import('./cart.js');
                    await module.saveSingleOrder();
                }
            });
        }
        
        // Кнопка очистки корзины
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
