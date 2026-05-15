
'use strict';

import { state, saveCart } from './state.js';
import { escapeHtml, showNotification, validateDates, debounce } from './utils.js';
import { api } from './api.js';
import { updateCartDisplay } from './cart.js';
import { clearAllSlots } from './slots.js';
import { checkLocationBusy, initDatePickersForLocation, loadBusyDates } from './events.js';


// Глобальное хранилище для количества оборудования
window.equipmentQuantities = window.equipmentQuantities || {};
// Хранилище ВСЕГО оборудования (всех типов)
let allEquipmentData = [];
// Текущий поисковый запрос
let currentSearchQuery = '';

// Загрузка фото локации
export const loadLocationPhoto = async (id) => {

    $('#locationPhoto').html('<div class="loading">Загрузка фото...</div>');
    try {
        const res = await api.getLocationPhoto(id);
        if (res.success && res.photo_url) {
            $('#locationPhoto').html(`<img src="${res.photo_url}" alt="${res.photo_name}">`);
        } else {
            $('#locationPhoto').html('<div class="photo-placeholder">📷 Нет фото</div>');
        }
    } catch (error) {
        console.error('Ошибка загрузки фото:', error);
        $('#locationPhoto').html('<div class="photo-placeholder">❌ Ошибка загрузки</div>');
    }
};

// Получение текущих дат (только из видимой формы)
const getCurrentDates = () => {
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

// Обработчик выбора локации
export const handleLocationSelect = async (locationId, locationName, isEvent) => {
    
    console.log(`handleLocationSelect: очистка слотов для новой локации ${locationId}`);
    
    // ========== ПРИНУДИТЕЛЬНАЯ ОЧИСТКА СЛОТОВ ==========
    // Очищаем глобальный массив слотов
    if (typeof clearAllSlots === 'function') {
        clearAllSlots();
    } else {
        import('./slots.js').then(module => {
            module.clearAllSlots();
        });
    }
    
    // Очищаем также глобальную переменную если есть
    if (window.slotsList) {
        window.slotsList = [];
    }
    if (window.clearAllSlots) {
        window.clearAllSlots();
    }
    
    // Проверяем занятость помещения
    const isAvailable = await checkLocationBusy(locationId, locationName);
    if (!isAvailable) return false;
    
    // Снимаем активный класс со всех локаций
    $('.location-item').removeClass('active');
    // Добавляем активный класс выбранной локации
    $(`.location-item[data-id="${locationId}"]`).addClass('active');
    
    state.currentLocation = { id: locationId, name: locationName, is_event: isEvent };
    
    // Настраиваем отображение блока аренды
    initDatePickersForLocation(isEvent);
    
    // Загружаем фото
    loadLocationPhoto(locationId);
    
    // Загружаем занятые даты для календаря (только для мероприятий)
    if (isEvent) {
        await loadBusyDates();
    }
    
    // Обновляем список оборудования
    await updateEquipmentList();
    
    return true;
};

// Загрузка ВСЕГО оборудования для локации (без фильтрации по типам)
const loadAllEquipment = async () => {
    if (!state.currentLocation) return [];
    
    try {
        // Загружаем оборудование из локации
        const locationResponse = await $.ajax({
            url: '/api/equipment-by-location/',
            method: 'GET',
            data: {
                location_id: state.currentLocation.id,
                type_ids: []
            }
        });
        
        // Загружаем общее оборудование
        const commonResponse = await $.ajax({
            url: '/api/common-equipment/',
            method: 'GET',
            data: {
                type_ids: []
            }
        });
        
        let allEquipment = [];
        
        if (locationResponse.success && locationResponse.equipment) {
            allEquipment = [...locationResponse.equipment];
        }
        
        if (commonResponse.success && commonResponse.equipment) {
            const commonWithFlag = commonResponse.equipment.map(eq => ({
                ...eq,
                is_common: true
            }));
            allEquipment = [...allEquipment, ...commonWithFlag];
        }
        
        return allEquipment;
    } catch (error) {

        return [];
    }
};

// Фильтрация оборудования по поисковому запросу
const filterEquipmentBySearch = (equipment, searchQuery) => {
    if (!searchQuery || searchQuery.trim() === '') {
        return equipment;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return equipment.filter(item => {
        // Поиск по названию оборудования
        if (item.name && item.name.toLowerCase().includes(query)) return true;
        // Поиск по типу оборудования
        if (item.type_name && item.type_name.toLowerCase().includes(query)) return true;
        return false;
    });
};

// Фильтрация оборудования по типам
const filterEquipmentByTypes = (equipment, typeIds) => {
    if (typeIds.length === 0) return equipment;
    return equipment.filter(eq => typeIds.includes(String(eq.type_id)));
};

// Обновление отображения с учетом поиска
const updateDisplayWithSearch = () => {
    if (!allEquipmentData.length) return;
    
    // Сначала фильтруем по типам
    const typeIds = [...state.selectedTypes];
    let filteredByType = filterEquipmentByTypes(allEquipmentData, typeIds);
    
    // Затем фильтруем по поисковому запросу
    const filteredBySearch = filterEquipmentBySearch(filteredByType, currentSearchQuery);
    
    // Обновляем счетчик результатов поиска
    updateSearchResultCount(filteredBySearch.length, filteredByType.length);
    
    if (filteredBySearch.length > 0) {
        // Выполняем проверку доступности с учетом выбранных дат
        checkAvailabilityWithData(filteredBySearch);
    } else {
        const message = currentSearchQuery 
            ? `<div class="info-message">Ничего не найдено по запросу "${escapeHtml(currentSearchQuery)}"</div>`
            : '<div class="info-message">Выберите типы оборудования для отображения</div>';
        $('#equipmentContainer').html(message);
    }
};

// Обновление счетчика результатов поиска
const updateSearchResultCount = (found, total) => {
    const searchInput = $('#searchEquipment');
    const existingCount = searchInput.siblings('.search-result-count');
    
    if (currentSearchQuery && found !== total) {
        if (existingCount.length) {
            existingCount.text(`Найдено: ${found} из ${total}`);
        } else {
            // searchInput.after(`<span class="search-result-count">Найдено: ${found} из ${total}</span>`);
        }
    } else {
        existingCount.remove();
    }
};

// Обработчик поиска (с debounce)
const handleEquipmentSearch = debounce((query) => {
    currentSearchQuery = query;
    updateDisplayWithSearch();
}, 300);

// Очистка поиска
export const clearEquipmentSearch = () => {
    $('#searchEquipment').val('');
    currentSearchQuery = '';
    updateDisplayWithSearch();
    showNotification('Поиск очищен', 'info');
};

// Инициализация поиска оборудования
export const initEquipmentSearch = () => {
    const searchInput = $('#searchEquipment');
    
    if (!searchInput.length) return;
    
    // Удаляем старые обработчики
    searchInput.off('input');
    
    // Добавляем обработчик ввода
    searchInput.on('input', function() {
        const query = $(this).val();
        handleEquipmentSearch(query);
    });
    
    // Добавляем кнопку очистки, если её нет
    if (!searchInput.siblings('.clear-search-btn').length) {
        searchInput.after('<button class="clear-search-btn" title="Очистить поиск">✖</button>');
        searchInput.siblings('.clear-search-btn').on('click', () => clearEquipmentSearch());
    }
};

// Проверка доступности оборудования
export const checkAvailability = async () => {
    if (!state.currentLocation) {
        return;
    }
    
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    const typeIds = [...state.selectedTypes];
    
    $('#equipmentContainer').html('<div class="loading">⏳ Проверка доступности оборудования...</div>');
    
    try {
        const response = await api.checkEquipmentAvailability(
            state.currentLocation.id,
            dateStart,
            dateEnd,
            typeIds
        );
        
        if (response.success) {
            if (response.equipment && response.equipment.length > 0) {
                state.currentEquipment = response.equipment;
                displayEquipmentList(response.equipment);
            } else {
                $('#equipmentContainer').html('<div class="info-message">📭 Нет доступного оборудования на выбранные даты</div>');
            }
        } else {
            $('#equipmentContainer').html(`<div class="info-message">❌ ${response.error}</div>`);
        }
    } catch (error) {
        console.error('Ошибка проверки доступности:', error);
        $('#equipmentContainer').html('<div class="info-message">❌ Ошибка проверки доступности</div>');
    }
};

// Проверка доступности с переданными данными (для поиска)
const checkAvailabilityWithData = async (equipmentData) => {
    if (!state.currentLocation) return;
    
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    
    if (!dateStart || !dateEnd) {
        displayEquipmentList(equipmentData.map(eq => ({ ...eq, available: eq.quantity })));
        return;
    }
    
    try {
        const response = await api.checkEquipmentAvailability(
            state.currentLocation.id,
            dateStart,
            dateEnd,
            [...state.selectedTypes]
        );
        
        if (response.success && response.equipment) {
            // Создаем карту доступности
            const availabilityMap = new Map();
            response.equipment.forEach(eq => {
                availabilityMap.set(eq.equipment_id, eq.available);
            });
            
            // Объединяем данные с доступностью
            const equipmentWithAvailability = equipmentData.map(eq => ({
                ...eq,
                available: availabilityMap.get(eq.equipment_id) ?? eq.quantity
            }));
            
            displayEquipmentList(equipmentWithAvailability);
        } else {
            displayEquipmentList(equipmentData.map(eq => ({ ...eq, available: eq.quantity })));
        }
    } catch (error) {
        console.error('Ошибка проверки доступности:', error);
        displayEquipmentList(equipmentData.map(eq => ({ ...eq, available: eq.quantity })));
    }
};

// Обновление списка оборудования
export const updateEquipmentList = async () => {

    if (!state.currentLocation) {
        $('#equipmentContainer').html('<div class="info-message">📍 Выберите помещение</div>');
        return;
    }
    
    // Получаем даты из видимой формы
    let dateStart, dateEnd;
    
    if ($('#rentalDatesBlock').is(':visible')) {
        // Для блока аренды - даты не проверяем
        dateStart = $('#rentalDateStart').val();
        dateEnd = $('#rentalDateEnd').val();
        
        // Если даты не выбраны, всё равно загружаем оборудование
        if (!dateStart || !dateEnd) {
            // Загружаем оборудование без проверки дат
            allEquipmentData = await loadAllEquipment();
            if (allEquipmentData.length > 0) {
                initEquipmentSearch();
                updateDisplayWithSearch();
            }
            return;
        }
    } else {
        dateStart = $('#dateStart').val();
        dateEnd = $('#dateEnd').val();
        
        if (!dateStart || !dateEnd) {
            $('#equipmentContainer').html('<div class="info-message">📅 Выберите даты</div>');
            return;
        }
        
        const dateValid = validateDates(dateStart, dateEnd);
        if (!dateValid.valid) {
            $('#equipmentContainer').html(`<div class="info-message">⚠️ ${dateValid.error}</div>`);
            return;
        }
    }
    
    // Сохраняем текущие количества перед обновлением
    $('.equipment-item').each(function() {
        const equipmentId = $(this).data('id');
        const quantity = parseInt($(this).find('.qty-input').val());
        if (!isNaN(quantity) && quantity >= 0) {
            window.equipmentQuantities[equipmentId] = quantity;
        }
    });
    
    // Загружаем ВСЕ оборудование
    allEquipmentData = await loadAllEquipment();
    
    if (allEquipmentData.length > 0) {
        initEquipmentSearch();
        updateDisplayWithSearch();
    } else if (allEquipmentData.length === 0) {
        $('#equipmentContainer').html('<div class="info-message">📭 Нет доступного оборудования</div>');
    }
};

// Отображение списка оборудования
export const displayEquipmentList = (equipment) => {

    if (!equipment?.length) {
        $('#equipmentContainer').html('<div class="info-message">📭 Нет оборудования для выбранных параметров</div>');
        return;
    }
    
    let html = '<div class="equipment-items">';
    
    equipment.forEach(item => {
        const availableQty = item.hasOwnProperty('available') ? item.available : item.quantity;
        const savedQuantity = window.equipmentQuantities[item.equipment_id] || 0;
        const commonBadge = item.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
        const isUnavailable = availableQty <= 0;
        const finalQuantity = Math.min(savedQuantity, availableQty);
        
        // Подсветка при поиске
        let displayName = escapeHtml(item.name);
        if (currentSearchQuery) {
            const regex = new RegExp(`(${escapeRegex(currentSearchQuery)})`, 'gi');
            displayName = escapeHtml(item.name).replace(regex, '<span class="highlight">$1</span>');
        }
        
        html += `
            <div class="equipment-item ${isUnavailable ? 'equipment-unavailable' : ''}" 
                 data-id="${item.equipment_id}" 
                 data-is-common="${item.is_common || false}"
                 data-name="${escapeHtml(item.name)}">
                <div>
                    <div class="equipment-name">
                        ${displayName}
                        ${commonBadge}
                        <span class="equipment-type">📌 ${escapeHtml(item.type_name)}</span>
                    </div>
                    <div class="equipment-quantity">
                        Доступно: <strong class="${isUnavailable ? 'text-danger' : 'text-success'}">${availableQty}</strong> шт.
                        ${isUnavailable ? '<span class="unavailable-badge">Нет в наличии</span>' : ''}
                    </div>
                </div>
                <div class="equipment-control">
                    <label></label>
                    <input type="number" 
                           min="0" 
                           max="${availableQty}" 
                           value="${finalQuantity}" 
                           class="qty-input" 
                           data-max="${availableQty}"
                           data-id="${item.equipment_id}"
                           ${isUnavailable ? 'disabled' : ''}>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    $('#equipmentContainer').html(html);
    
    // Обработчики для полей ввода
    $('.qty-input:not([disabled])').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        const equipmentId = $(this).data('id');
        
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
        
        window.equipmentQuantities[equipmentId] = val;

    });
};

// Экранирование спецсимволов для регулярного выражения
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Новая функция для обработки слотов в корзину
const processSlotsToCart = (slots) => {
    if (!slots || slots.length === 0) {
        showNotification('⚠️ Нет добавленных слотов', 'warning');
        return;
    }
    
    if (!state.currentLocation) {
        showNotification('❌ Выберите помещение', 'error');
        return;
    }
    
    if (state.selectedLocations.has(state.currentLocation.id.toString())) {
        showNotification('⚠️ Это помещение уже добавлено в заказ', 'warning');
        return;
    }
    
    const comment = $('#orderComment').val().trim();
    
    // ========== ПОЛУЧАЕМ ОБЩУЮ ДАТУ В ЗАВИСИМОСТИ ОТ ТИПА ПОМЕЩЕНИЯ ==========
    const isEvent = state.currentLocation.is_event;
    let commonDateStart, commonDateEnd;
    
    if (isEvent) {
        commonDateStart = $('#dateStart').val();
        commonDateEnd = $('#dateEnd').val();
    } else {
        commonDateStart = $('#rentalDateStart').val();
        commonDateEnd = $('#rentalDateEnd').val();
    }
    
    const slotOrder = {
        type: 'slots',
        location_id: state.currentLocation.id,
        location_name: state.currentLocation.name,
        comment: comment || '',
        common_date_start: commonDateStart,
        common_date_end: commonDateEnd,
        is_event: isEvent,
        slots: []
    };
    
    // Добавляем каждый слот
    slots.forEach(slot => {
        if (!slot.equipment || slot.equipment.length === 0) return;
        
        slotOrder.slots.push({
            date_start: slot.date_start,
            date_end: slot.date_end,
            equipment: slot.equipment.map(eq => ({
                equipment_id: eq.id,
                equipment_name: eq.name,
                type_name: eq.type_name || 'Оборудование',
                quantity: eq.quantity,
                max_quantity: eq.quantity,
                is_common: eq.is_common || false
            }))
        });
    });
    
    if (slotOrder.slots.length === 0) {
        showNotification('⚠️ Нет валидных слотов для добавления', 'warning');
        return;
    }
    
    // Сортируем слоты
    slotOrder.slots.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    
    state.orderCart.push(slotOrder);
    state.selectedLocations.add(state.currentLocation.id.toString());
    $(`.location-item[data-id="${state.currentLocation.id}"]`).addClass('disabled');
    
    saveCart();
    updateCartDisplay();
    
    // Очищаем слоты
    if (typeof window.clearAllSlots === 'function') {
        window.clearAllSlots();
    }
    
    // Сброс состояния
    state.currentLocation = null;
    state.selectedTypes.clear();
    $('#searchEquipment').val('');
    $('.location-item').removeClass('active');
    $('.type-item input').prop('checked', false);
    $('#equipmentContainer').html('<div class="info-message">📍 Выберите локацию, даты и типы оборудования</div>');
    $('#orderComment').val('');
    $('#slotDateStart, #slotDateEnd').val('');
    
    window.equipmentQuantities = {};
    
    showNotification(`✅ Добавлено ${slotOrder.slots.length} слотов в заявку!`, 'success');
};

// Добавление в корзину
export const addToCart = () => {
    
    const mode = localStorage.getItem('viewMode') || 'event';
    
    // ========== РЕЖИМ "СЛОТЫ" ==========
    if (mode === 'slots') {
        let allSlots = [];
        if (typeof window.getAllSlots === 'function') {
            allSlots = window.getAllSlots();
            processSlotsToCart(allSlots);
        } else {
            import('./slots.js').then(module => {
                allSlots = module.getAllSlots();
                processSlotsToCart(allSlots);
            });
        }
        return;
    }
    
    // ========== РЕЖИМ "МЕРОПРИЯТИЕ" (ОБЫЧНЫЙ РЕЖИМ) ==========
    if (!state.currentLocation) {
        showNotification('❌ Выберите помещение', 'error');
        return;
    }
    
    // ========== ПОЛУЧАЕМ ДАТЫ В ЗАВИСИМОСТИ ОТ ТИПА ПОМЕЩЕНИЯ ==========
    const isEvent = state.currentLocation.is_event;
    let dateStart, dateEnd;
    
    if (isEvent) {
        // Для мероприятий - используем основной блок дат
        dateStart = $('#dateStart').val();
        dateEnd = $('#dateEnd').val();
        
        if (!dateStart || !dateEnd) {
            showNotification('❌ Выберите даты мероприятия', 'error');
            return;
        }
    } else {
        // Для обычных помещений (аренда) - используем блок аренды
        dateStart = $('#rentalDateStart').val();
        dateEnd = $('#rentalDateEnd').val();
        
        if (!dateStart || !dateEnd) {
            showNotification('❌ Выберите даты аренды', 'error');
            return;
        }
    }
    
    // Валидация дат
    const dateValid = validateDates(dateStart, dateEnd);
    if (!dateValid.valid) {
        showNotification(dateValid.error, 'error');
        return;
    }
    
    // Собираем оборудование
    const selected = [];
    let hasLocationEquipment = false;
    let hasCommonEquipment = false;
    
    for (const eq of allEquipmentData) {
        const quantity = window.equipmentQuantities[eq.equipment_id] || 0;
        if (quantity > 0) {
            selected.push({
                equipment_id: eq.equipment_id,
                equipment_name: eq.name,
                type_name: eq.type_name,
                quantity: quantity,
                max_quantity: eq.quantity,
                is_common: eq.is_common || false
            });
            
            if (eq.is_common) {
                hasCommonEquipment = true;
            } else {
                hasLocationEquipment = true;
            }
        }
    }
    
    if (!selected.length) {
        showNotification('⚠️ Выберите хотя бы одно оборудование', 'warning');
        return;
    }
    
    if (hasLocationEquipment && !state.currentLocation) {
        showNotification('❌ Выберите локацию для выбранного оборудования', 'error');
        return;
    }
    
    if (hasLocationEquipment && state.selectedLocations.has(state.currentLocation.id.toString())) {
        showNotification('⚠️ Эта локация уже добавлена в заказ', 'warning');
        return;
    }
    
    const comment = $('#orderComment').val().trim();
    
    // Создаём объект заказа
    const orderItem = {
        type: 'regular',
        location_id: state.currentLocation.id,
        location_name: state.currentLocation.name,
        date_start: dateStart,
        date_end: dateEnd,
        is_event: state.currentLocation.is_event,
        equipment: selected,
        comment: comment || ''
    };
    
    state.orderCart.push(orderItem);
    
    if (state.currentLocation) {
        state.selectedLocations.add(state.currentLocation.id.toString());
        $(`.location-item[data-id="${state.currentLocation.id}"]`).addClass('disabled');
    }
    
    saveCart();
    updateCartDisplay();
    
    // Сброс состояния
    state.currentLocation = null;
    state.selectedTypes.clear();
    currentSearchQuery = '';
    $('#searchEquipment').val('');
    $('.location-item').removeClass('active');
    $('.type-item input').prop('checked', false);
    $('#equipmentContainer').html('<div class="info-message">📍 Выберите локацию, даты и типы оборудования</div>');
    $('#orderComment').val('');
    
    window.equipmentQuantities = {};
    allEquipmentData = [];
    
    showNotification(`✅ Добавлено в заказ!`, 'success');
};