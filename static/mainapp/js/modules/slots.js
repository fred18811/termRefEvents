// modules/slots.js
import { state } from './state.js';
import { showNotification, escapeHtml, formatDateHeader, formatTime, getDateKey, formatDateTime, formatDateTimeForDisplay, formatForInput} from './utils.js';
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
                equipmentHtml += `<div class="slot-equipment-item"><span>${escapeHtml(eq.name)}</span><span>${eq.quantity} шт.</span></div>`;
            });
            
            // Находим глобальный индекс слота для удаления
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
    
    // Обработчики удаления слотов
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
    slotsList = [];
    displaySlotsList();
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
    
    // Обновляем altInput для flatpickr
    if (document.getElementById('slotDateEnd').nextSibling) {
        document.getElementById('slotDateEnd').nextSibling.value = formatDateTimeForDisplay(endDate);
    }
    
    // Если есть выбранная локация, обновляем оборудование
    if (state.currentLocation) {
        updateEquipmentList();
    }
};

// Обновление дат для следующего слота на основе интервала
export const updateNextSlotDates = () => {
    if (slotsList.length === 0) return;
    
    // Находим последний слот по времени (с учётом сортировки)
    const sortedSlots = sortSlots(slotsList);
    const lastSlot = sortedSlots[sortedSlots.length - 1];
    if (!lastSlot) return;
    
    const intervalMinutes = parseInt($('#slotInterval').val(), 10);
    const lastEndDate = new Date(lastSlot.date_end);
    
    // Новая дата начала = предыдущая дата окончания
    const newStartDate = new Date(lastEndDate);
    
    // Новая дата окончания = новая дата начала + интервал
    const newEndDate = new Date(newStartDate.getTime() + intervalMinutes * 60000);
    
    // Обновляем поля
    $('#slotDateStart').val(formatForInput(newStartDate));
    $('#slotDateEnd').val(formatForInput(newEndDate));
    
    // Обновляем altInput для flatpickr
    if (document.getElementById('slotDateStart').nextSibling) {
        document.getElementById('slotDateStart').nextSibling.value = formatDateTimeForDisplay(newStartDate);
        document.getElementById('slotDateEnd').nextSibling.value = formatDateTimeForDisplay(newEndDate);
    }
};

// Добавление нового слота
export const addNewSlot = () => {
    const mode = localStorage.getItem('viewMode') || 'event';
    if (mode !== 'slots') {
        showNotification('Режим "Слоты" не активен', 'warning');
        return false;
    }
    
    // Получаем текущие даты
    const dateStart = $('#slotDateStart').val();
    const dateEnd = $('#slotDateEnd').val();
    
    if (!dateStart || !dateEnd) {
        showNotification('Выберите даты слота', 'warning');
        return false;
    }
    
    // Получаем выбранное оборудование
    const selectedEquipment = [];
    $('.equipment-item').each(function() {
        const quantity = parseInt($(this).find('.qty-input').val());
        if (quantity > 0) {
            selectedEquipment.push({
                id: $(this).data('id'),
                name: $(this).data('name'),
                quantity: quantity,
                is_common: $(this).data('is-common') || false
            });
        }
    });
    
    if (selectedEquipment.length === 0) {
        showNotification('Выберите оборудование для слота', 'warning');
        return false;
    }
    
    // Добавляем слот
    slotsList.push({
        date_start: dateStart,
        date_end: dateEnd,
        equipment: selectedEquipment
    });
    
    displaySlotsList();
    
    // Очищаем выбранное оборудование
    $('.qty-input').val(0);
    window.equipmentQuantities = {};
    
    // Обновляем даты для следующего слота
    updateNextSlotDates();
    
    showNotification(`Слот добавлен! Всего слотов: ${slotsList.length}`, 'success');
    return true;
};

// Инициализация календарей для слотов
export const initSlotDatePickers = () => {
    const slotDateStartInput = document.getElementById('slotDateStart');
    const slotDateEndInput = document.getElementById('slotDateEnd');
    
    if (!slotDateStartInput || !slotDateEndInput) return;
    
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    
    // Календарь для даты начала слота
    slotDateStartPicker = flatpickr(slotDateStartInput, {
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
    
    // Календарь для даты окончания слота
    slotDateEndPicker = flatpickr(slotDateEndInput, {
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

// Показать/скрыть элементы слотов в зависимости от режима
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
        
        // Очищаем слоты при скрытии
        slotsList = [];
        displaySlotsList();
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
    // Обработчик кнопки "Добавить слот"
    $('#addSlotBtn').off('click').on('click', function() {
        addNewSlot();
    });
    
    // Обработчик изменения интервала
    $('#slotInterval').off('change').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        if (mode === 'slots') {
            updateEndDateByInterval();
        }
    });
    
    // Обработчик изменения даты начала слота
    $('#slotDateStart').off('change').on('change', function() {
        const mode = localStorage.getItem('viewMode') || 'event';
        if (mode === 'slots') {
            updateEndDateByInterval();
        }
    });
};

// Экспорт для доступа из других модулей
export { slotsList, formatDateTimeForDisplay };

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
    
    // Сортируем слоты внутри каждой группы по времени
    for (const [dateKey, slotsInGroup] of groups) {
        slotsInGroup.sort((a, b) => {
            const timeA = new Date(a.date_start);
            const timeB = new Date(b.date_start);
            return timeA - timeB;
        });
    }
    
    return groups;
};