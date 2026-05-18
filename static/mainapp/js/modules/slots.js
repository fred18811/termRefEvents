// modules/slots.js
import { state } from './state.js';
import { showNotification, escapeHtml, formatDateHeader, formatTime, getDateKey, formatDateTime, formatDateTimeForDisplay, formatForInput } from './utils.js';
import { updateEquipmentList } from './location.js';

// ========== ПЕРЕМЕННЫЕ ==========
let slotsList = [];
let slotDateStartPicker = null;
let slotDateEndPicker = null;

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

// Отображение списка слотов
export const displaySlotsList = () => {
    const container = $('#slotsList');
    
    if (!slotsList.length) {
        container.html('<div class="empty-slots">📭 Нет добавленных слотов. Нажмите "+ Добавить слот"</div>');
        return;
    }
    
    const groupedSlots = groupSlotsByDate(slotsList);
    let html = '';
    
    for (const [dateKey, slots] of groupedSlots) {
        const dateHeader = formatDateHeader(slots[0].date_start);
        html += `<div class="slots-date-group"><div class="slots-date-header">📅 ${dateHeader}</div>`;
        
        slots.forEach((slot, idx) => {
            const startTime = formatTime(slot.date_start);
            const endTime = formatTime(slot.date_end);
            
            let equipmentHtml = '';
            slot.equipment.forEach(eq => {
                const typeBadge = eq.type_name ? `<span class="equipment-type-badge">${escapeHtml(eq.type_name)}</span>` : '';
                equipmentHtml += `
                    <div class="slot-equipment-item">
                        <div>
                            <span class="equipment-name-in-slot">${escapeHtml(eq.name)}</span>
                            ${typeBadge}
                        </div>
                        <span>${eq.quantity} шт.</span>
                    </div>
                `;
            });
            
            const globalIndex = slotsList.findIndex(s => s.date_start === slot.date_start && s.date_end === slot.date_end);
            
            html += `
                <div class="slot-item" data-slot-index="${globalIndex}">
                    <div class="slot-info">
                        <div class="slot-time">⏰ ${startTime} - ${endTime}</div>
                        <div class="slot-equipment">
                            ${equipmentHtml || 'Нет оборудования'}
                        </div>
                    </div>
                    <button class="slot-remove-btn" data-slot-index="${globalIndex}" title="Удалить слот">🗑️</button>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    container.html(html);
    
    $('.slot-remove-btn').off('click').on('click', function() {
        const index = $(this).data('slot-index');
        removeSlot(index);
    });
};

// Удаление слота
export const removeSlot = (index) => {
    slotsList.splice(index, 1);
    displaySlotsList();
    showNotification('Слот удален', 'info');
};

// Очистка всех слотов
export const clearAllSlots = () => {
    console.log('clearAllSlots вызвана, очищаем слоты');
    slotsList = [];
    displaySlotsList();  // Это обновит DOM и покажет "Нет добавленных слотов"
};

// Получение всех слотов
export const getAllSlots = () => {
    return [...slotsList];
};

// Обновление даты окончания на основе выбранного интервала
export const updateEndDateByInterval = () => {
    const startDateStr = $('#slotDateStart').val();
    if (!startDateStr) return;
    
    const intervalMinutes = parseInt($('#slotInterval').val(), 10);
    if (isNaN(intervalMinutes)) return;
    
    const startDate = new Date(startDateStr);
    const endDate = new Date(startDate.getTime() + intervalMinutes * 60000);
    
    const formattedEndDate = formatForInput(endDate);
    $('#slotDateEnd').val(formattedEndDate);
    
    if (document.getElementById('slotDateEnd').nextSibling) {
        document.getElementById('slotDateEnd').nextSibling.value = formatDateTimeForDisplay(endDate);
    }
    
    if (state.currentLocation) {
        updateEquipmentList();
    }
};

// Обновление дат для следующего слота на основе интервала
export const updateNextSlotDates = () => {
    if (slotsList.length === 0) return;
    
    const sortedSlots = sortSlots(slotsList);
    const lastSlot = sortedSlots[sortedSlots.length - 1];
    if (!lastSlot) return;
    
    const intervalMinutes = parseInt($('#slotInterval').val(), 10);
    if (isNaN(intervalMinutes)) return;
    
    // Парсим дату из формата "YYYY-MM-DD HH:MM:SS"
    const parseDate = (dateStr) => {
        if (dateStr.includes(' ')) {
            const [datePart, timePart] = dateStr.split(' ');
            const [year, month, day] = datePart.split('-');
            const [hours, minutes, seconds] = timePart.split(':');
            return new Date(year, month - 1, day, hours, minutes, seconds || 0);
        }
        return new Date(dateStr);
    };
    
    const lastEndDate = parseDate(lastSlot.date_end);
    const newStartDate = new Date(lastEndDate);
    const newEndDate = new Date(newStartDate.getTime() + intervalMinutes * 60000);
    
    // Форматируем в единый формат
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    const formattedStartDate = formatDateTime(newStartDate);
    const formattedEndDate = formatDateTime(newEndDate);
    
    $('#slotDateStart').val(formattedStartDate);
    $('#slotDateEnd').val(formattedEndDate);
    
    // Обновляем altInput для flatpickr
    if (document.getElementById('slotDateStart').nextSibling) {
        document.getElementById('slotDateStart').nextSibling.value = formatDateTimeForDisplay(newStartDate);
        document.getElementById('slotDateEnd').nextSibling.value = formatDateTimeForDisplay(newEndDate);
    }
    
    if (window.slotDateStartPicker) {
        window.slotDateStartPicker.setDate(newStartDate, false);
    }
    if (window.slotDateEndPicker) {
        window.slotDateEndPicker.setDate(newEndDate, false);
    }
};

// Добавление нового слота
export const addNewSlot = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    if (mode !== 'slots') {
        showNotification('Режим "Слоты" не активен', 'warning');
        return false;
    }
    
    if (!state.currentLocation) {
        showNotification('Сначала выберите помещение', 'warning');
        return false;
    }
    
    const dateStartRaw = $('#slotDateStart').val();
    const dateEndRaw = $('#slotDateEnd').val();
    
    if (!dateStartRaw || !dateEndRaw) {
        showNotification('Выберите даты слота', 'warning');
        return false;
    }
    
    // ========== ФОРМАТИРУЕМ ДАТЫ В ЕДИНЫЙ ФОРМАТ ==========
    // Преобразуем в единый формат "YYYY-MM-DD HH:MM:SS"
    const formatDateTime = (dateStr) => {
        // Если уже в формате с пробелом, возвращаем как есть
        if (dateStr.includes(' ') && !dateStr.includes('T')) {
            // Проверяем, есть ли секунды
            if (dateStr.split(' ')[1].split(':').length === 2) {
                return dateStr + ':00';
            }
            return dateStr;
        }
        // Если в формате ISO с T, преобразуем
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    const dateStart = formatDateTime(dateStartRaw);
    const dateEnd = formatDateTime(dateEndRaw);
    
    console.log('Отформатированные даты:', { dateStart, dateEnd });
    
    // Получаем выбранное оборудование
    const selectedEquipment = [];
    $('.equipment-item').each(function() {
        const quantity = parseInt($(this).find('.qty-input').val());
        if (quantity > 0) {
            let typeName = 'Оборудование';
            const typeElement = $(this).find('.equipment-type');
            if (typeElement.length) {
                typeName = typeElement.text().replace('📌 ', '').trim();
            }
            
            selectedEquipment.push({
                id: $(this).data('id'),
                name: $(this).data('name'),
                type_name: typeName,
                quantity: quantity,
                is_common: $(this).data('is-common') || false
            });
        }
    });
    
    if (selectedEquipment.length === 0) {
        showNotification('Выберите оборудование для слота', 'warning');
        return false;
    }
    
    // Проверяем, есть ли уже слот с таким временем
    const existingSlotIndex = slotsList.findIndex(slot => 
        slot.date_start === dateStart && slot.date_end === dateEnd
    );
    
    if (existingSlotIndex !== -1) {
        const existingSlot = slotsList[existingSlotIndex];
        
        selectedEquipment.forEach(newEq => {
            const existingEqIndex = existingSlot.equipment.findIndex(eq => eq.id === newEq.id);
            
            if (existingEqIndex !== -1) {
                existingSlot.equipment[existingEqIndex].quantity += newEq.quantity;
            } else {
                existingSlot.equipment.push(newEq);
            }
        });
        
        slotsList[existingSlotIndex] = existingSlot;
        showNotification(`Оборудование добавлено в существующий слот!`, 'success');
    } else {
        slotsList.push({
            date_start: dateStart,
            date_end: dateEnd,
            equipment: selectedEquipment
        });
        showNotification(`Слот добавлен! Всего слотов: ${slotsList.length}`, 'success');
    }
    
    displaySlotsList();
    
    // Очищаем выбранное оборудование
    $('.qty-input').val(0);
    window.equipmentQuantities = {};
    
    // Обновляем даты для следующего слота
    updateNextSlotDates();
    
    return true;
};

// Инициализация календарей для слотов
export const initSlotDatePickers = () => {
    const slotDateStartInput = document.getElementById('slotDateStart');
    const slotDateEndInput = document.getElementById('slotDateEnd');
    
    if (!slotDateStartInput || !slotDateEndInput) return;
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    window.slotDateStartPicker = flatpickr(slotDateStartInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        onChange: async () => {
            updateEndDateByInterval();
        }
    });
    
    window.slotDateEndPicker = flatpickr(slotDateEndInput, {
        locale: 'ru',
        enableTime: true,
        dateFormat: 'Y-m-d H:i:S',
        altFormat: 'd.m.Y H:i',
        altInput: true,
        time_24hr: true,
        minDate: minDate,
        minuteIncrement: 30,
        onChange: async () => {
            if (state.currentLocation) {
                await updateEquipmentList();
            }
        }
    });
};

// Показать/скрыть элементы слотов
export const toggleSlotsUI = (show) => {
    const slotsDatesBlock = document.getElementById('slotsDatesBlock');
    const intervalSelectorBlock = document.getElementById('intervalSelectorBlock');
    const addSlotBtnBlock = document.getElementById('addSlotBtnBlock');
    const slotsListContainer = $('#slotsList');
    
    if (show) {
        if (slotsDatesBlock) slotsDatesBlock.style.display = 'flex';
        if (intervalSelectorBlock) intervalSelectorBlock.style.display = 'flex';
        if (addSlotBtnBlock) addSlotBtnBlock.style.display = 'flex';
        slotsListContainer.show();
    } else {
        if (slotsDatesBlock) slotsDatesBlock.style.display = 'none';
        if (intervalSelectorBlock) intervalSelectorBlock.style.display = 'none';
        if (addSlotBtnBlock) addSlotBtnBlock.style.display = 'none';
        slotsListContainer.hide();
        $('#slotDateStart, #slotDateEnd').val('');
    }
};

// Синхронизация дат слотов с основным блоком
export const syncSlotDatesWithMain = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    
    if (mode === 'slots') {
        const mainDateStart = $('#dateStart').val();
        
        if (mainDateStart) {
            $('#slotDateStart').val(mainDateStart);
            if (document.getElementById('slotDateStart').nextSibling) {
                document.getElementById('slotDateStart').nextSibling.value = formatDateTimeForDisplay(new Date(mainDateStart));
            }
            updateEndDateByInterval();
        }
    }
};

// Инициализация обработчиков для слотов
export const initSlotsHandlers = () => {
    $('#addSlotBtn').off('click').on('click', function() {
        addNewSlot();
    });
    
    $('#slotInterval').off('change').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        if (mode === 'slots') {
            updateEndDateByInterval();
        }
    });
    
    $('#slotDateStart').off('change').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        if (mode === 'slots') {
            updateEndDateByInterval();
        }
    });
};

// Сортировка слотов по дате и времени
const sortSlots = (slots) => {
    return [...slots].sort((a, b) => {
        const dateA = new Date(a.date_start);
        const dateB = new Date(b.date_start);
        return dateA - dateB;
    });
};

// Группировка слотов по датам
const groupSlotsByDate = (slots) => {
    const sortedSlots = sortSlots(slots);
    const groups = new Map();
    
    sortedSlots.forEach(slot => {
        const dateKey = getDateKey(slot.date_start);
        if (!groups.has(dateKey)) {
            groups.set(dateKey, []);
        }
        groups.get(dateKey).push(slot);
    });
    
    for (const [dateKey, slotsInGroup] of groups) {
        slotsInGroup.sort((a, b) => {
            const timeA = new Date(a.date_start);
            const timeB = new Date(b.date_start);
            return timeA - timeB;
        });
    }
    
    return groups;
};