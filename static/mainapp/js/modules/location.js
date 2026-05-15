
'use strict';

import { state, saveCart } from './state.js';
import { escapeHtml, showNotification, validateDates, debounce } from './utils.js';
import { api } from './api.js';
import { updateCartDisplay } from './cart.js';
import {getSelectedDates} from './events.js'
import {updateEndDateByInterval} from './slots.js'
import {formatDateTimeForDisplay} from './utils.js'


// Глобальное хранилище для количества оборудования
window.equipmentQuantities = window.equipmentQuantities || {};
// Хранилище ВСЕГО оборудования (всех типов)
let allEquipmentData = [];
// Текущий поисковый запрос
let currentSearchQuery = '';

// Загрузка фото локации
export const loadLocationPhoto = async (id) => {
    console.log('Загрузка фото для локации:', id);
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
        
        console.log('Загружено всего оборудования:', allEquipment.length);
        return allEquipment;
    } catch (error) {
        console.error('Ошибка загрузки всего оборудования:', error);
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
    
    console.log(`Поиск: "${currentSearchQuery}" - найдено: ${filteredBySearch.length} из ${filteredByType.length}`);
    
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
        console.log('Нет выбранной локации');
        return;
    }
    
    const dateStart = $('#dateStart').val();
    const dateEnd = $('#dateEnd').val();
    const typeIds = [...state.selectedTypes];
    
    console.log('Проверка доступности:', {
        location_id: state.currentLocation.id,
        date_start: dateStart,
        date_end: dateEnd,
        type_ids: typeIds
    });
    
    $('#equipmentContainer').html('<div class="loading">⏳ Проверка доступности оборудования...</div>');
    
    try {
        const response = await api.checkEquipmentAvailability(
            state.currentLocation.id,
            dateStart,
            dateEnd,
            typeIds
        );
        
        console.log('Ответ API по доступности:', response);
        
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
    console.log('updateEquipmentList вызван');
    
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
    console.log('Отображение оборудования:', equipment.length, 'позиций');
    
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
        console.log(`Сохранено количество для оборудования ${equipmentId}: ${val} (доступно: ${max})`);
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
    
    // Проверяем, есть ли выбранная локация
    if (!state.currentLocation) {
        showNotification('❌ Выберите помещение', 'error');
        return;
    }
    
    // Проверяем, не добавлена ли уже эта локация
    if (state.selectedLocations.has(state.currentLocation.id.toString())) {
        showNotification('⚠️ Это помещение уже добавлено в заказ', 'warning');
        return;
    }
    
    const comment = $('#orderComment').val().trim();
    
    // Получаем общую дату локации из полей dateStart и dateEnd
    const commonDateStart = $('#dateStart').val();
    const commonDateEnd = $('#dateEnd').val();
    
    // Создаём один заказ со слотами
    const slotOrder = {
        type: 'slots',
        location_id: state.currentLocation.id,
        location_name: state.currentLocation.name,
        comment: comment || '',
        common_date_start: commonDateStart,
        common_date_end: commonDateEnd,
        slots: []
    };
    
    // Добавляем каждый слот с его оборудованием
    slots.forEach(slot => {
        if (!slot.equipment || slot.equipment.length === 0) return;
        
        slotOrder.slots.push({
            date_start: slot.date_start,  // Сохраняем свою дату начала слота
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
    
    // Сортируем слоты по дате и времени
    slotOrder.slots.sort((a, b) => {
        return new Date(a.date_start) - new Date(b.date_start);
    });
    
    // Добавляем в корзину
    state.orderCart.push(slotOrder);
    
    // Отмечаем локацию как добавленную
    state.selectedLocations.add(state.currentLocation.id.toString());
    $(`.location-item[data-id="${state.currentLocation.id}"]`).addClass('disabled');
    
    saveCart();
    updateCartDisplay();
    
    // Очищаем слоты
    if (typeof window.clearAllSlots === 'function') {
        window.clearAllSlots();
    }
    
    // Сбрасываем состояние, НО НЕ СБРАСЫВАЕМ ДАТЫ
    state.currentLocation = null;
    state.selectedTypes.clear();
    $('#searchEquipment').val('');
    $('.location-item').removeClass('active');
    $('.type-item input').prop('checked', false);
    $('#equipmentContainer').html('<div class="info-message">📍 Выберите локацию, даты и типы оборудования</div>');
    $('#orderComment').val('');
    
    // ОЧИЩАЕМ ПОЛЯ СЛОТОВ, НО НЕ ОБЩУЮ ДАТУ
    $('#slotDateStart, #slotDateEnd').val('');
    
    // Восстанавливаем дату начала слота из общей даты
    const mainDateStart = $('#dateStart').val();
    if (mainDateStart) {
        $('#slotDateStart').val(mainDateStart);
        // Обновляем отображение в flatpickr
        if (document.getElementById('slotDateStart').nextSibling) {
            const formattedDate = formatDateTimeForDisplay(new Date(mainDateStart));
            document.getElementById('slotDateStart').nextSibling.value = formattedDate;
        }
        // Пересчитываем дату окончания по интервалу
        if (typeof updateEndDateByInterval === 'function') {
            updateEndDateByInterval();
        }
    }
    
    window.equipmentQuantities = {};
    
    showNotification(`✅ Добавлено ${slotOrder.slots.length} слотов в заявку!`, 'success');
};

// Добавление в корзину
export const addToCart = () => {
    console.log('addToCart вызван');
    
    const mode = localStorage.getItem('viewMode') || 'event';
    
    // ========== РЕЖИМ "СЛОТЫ" ==========
    if (mode === 'slots') {
        // Получаем все слоты из глобального массива
        let allSlots = [];
        if (typeof window.getAllSlots === 'function') {
            allSlots = window.getAllSlots();
        } else {
            import('./slots.js').then(module => {
                allSlots = module.getAllSlots();
                processSlotsToCart(allSlots);
            });
            return;
        }
        processSlotsToCart(allSlots);
        return;
    }
    
    // ========== РЕЖИМ "МЕРОПРИЯТИЕ" (существующая логика) ==========
    if (!state.currentLocation) {
        showNotification('❌ Выберите помещение', 'error');
        return;
    }
    
    const dates = getSelectedDates();
    const dateStart = dates.date_start;
    const dateEnd = dates.date_end;
    
    if (!dateStart || !dateEnd) {
        showNotification('❌ Выберите даты', 'error');
        return;
    }
    
    const dateValid = validateDates(dateStart, dateEnd);
    if (!dateValid.valid) {
        showNotification(dateValid.error, 'error');
        return;
    }
    
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
    
    state.orderCart.push({
        location_id: state.currentLocation?.id || null,
        location_name: state.currentLocation?.name || 'Общее оборудование',
        date_start: dateStart,
        date_end: dateEnd,
        is_event: state.currentLocation?.is_event || false,
        equipment: selected,
        comment: comment || '',
        is_slots_mode: false
    });
    
    if (state.currentLocation) {
        state.selectedLocations.add(state.currentLocation.id.toString());
        $(`.location-item[data-id="${state.currentLocation.id}"]`).addClass('disabled');
    }
    
    saveCart();
    updateCartDisplay();
    
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

// Функция обработки слотов
const processSlots = (slots) => {
    if (!slots || slots.length === 0) {
        showNotification('⚠️ Нет добавленных слотов', 'warning');
        return;
    }
    
    const comment = $('#orderComment').val().trim();
    let addedCount = 0;
    
    // Проверяем, есть ли выбранная локация
    if (!state.currentLocation) {
        showNotification('❌ Выберите помещение', 'error');
        return;
    }
    
    // Проверяем, не добавлена ли уже эта локация
    if (state.selectedLocations.has(state.currentLocation.id.toString())) {
        showNotification('⚠️ Это помещение уже добавлено в заказ', 'warning');
        return;
    }
    
    // Добавляем каждый слот как отдельный заказ в корзину
    slots.forEach(slot => {
        // Проверяем, что в слоте есть оборудование
        if (!slot.equipment || slot.equipment.length === 0) {
            console.warn('Слот без оборудования пропущен:', slot);
            return;
        }
        
        state.orderCart.push({
            location_id: state.currentLocation.id,
            location_name: state.currentLocation.name,
            date_start: slot.date_start,
            date_end: slot.date_end,
            is_event: state.currentLocation.is_event || false,
            equipment: slot.equipment.map(eq => ({
                equipment_id: eq.id,
                equipment_name: eq.name,
                type_name: eq.type_name || 'Оборудование',
                quantity: eq.quantity,
                max_quantity: eq.quantity,
                is_common: eq.is_common || false
            })),
            comment: comment || '',
            is_slots_mode: true,
            slot_time_start: slot.date_start,
            slot_time_end: slot.date_end
        });
        addedCount++;
    });
    
    if (addedCount === 0) {
        showNotification('⚠️ Нет валидных слотов для добавления', 'warning');
        return;
    }
    
    // Отмечаем локацию как добавленную
    state.selectedLocations.add(state.currentLocation.id.toString());
    $(`.location-item[data-id="${state.currentLocation.id}"]`).addClass('disabled');
    
    saveCart();
    updateCartDisplay();
    
    // Очищаем слоты после добавления
    if (typeof window.clearAllSlots === 'function') {
        window.clearAllSlots();
    } else {
        import('./slots.js').then(module => {
            module.clearAllSlots();
        });
    }
    
    // Сбрасываем состояние
    state.currentLocation = null;
    state.selectedTypes.clear();
    $('#searchEquipment').val('');
    $('.location-item').removeClass('active');
    $('.type-item input').prop('checked', false);
    $('#equipmentContainer').html('<div class="info-message">📍 Выберите локацию, даты и типы оборудования</div>');
    $('#orderComment').val('');
    $('#slotDateStart, #slotDateEnd').val('');
    
    window.equipmentQuantities = {};
    
    showNotification(`✅ Добавлено ${addedCount} слотов в заявку!`, 'success');
};