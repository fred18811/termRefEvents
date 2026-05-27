import { state, saveCart } from '../state.js';
import { escapeHtml, showNotification } from '../utils.js';
import { updateCartDisplay } from './cartDisplay.js';
import { 
    availableEquipment,
    currentEditIndex, 
    setCurrentEditIndex,
    formatDateTimeForInput,
    convertToServerDateFormat,
    loadAvailableEquipment
} from './cartUtils.js';
import { openAddEquipmentForSlot } from './cartSlotEquipment.js';

// Открытие модального окна редактирования слотов
export const openEditSlotsModal = async (index) => {
    setCurrentEditIndex(index);
    const item = state.orderCart[index];
    
    if (!item || item.type !== 'slots') return;
    
    console.log('Редактирование слотов:', item);
    
    await loadAvailableEquipment(item.location_id);
    
    const slotsHtml = generateSlotsEditHtml(item);
    const modalContent = generateSlotsEditModalHtml(item, slotsHtml);
    
    $('#editOrderContent').html(modalContent);
    $('#editOrderModal').css('display', 'flex');
    
    bindEditSlotsHandlers();
};

// Генерация HTML для редактирования слотов
const generateSlotsEditHtml = (item) => {
    let slotsHtml = '';
    
    item.slots.forEach((slot, slotIndex) => {
        const startTime = new Date(slot.date_start).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        const endTime = new Date(slot.date_end).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        
        let equipmentHtml = '';
        slot.equipment.forEach(eq => {
            const displayTypeName = eq.type_name || 'Оборудование';
            
            equipmentHtml += `
                <div class="edit-slot-equipment-item" data-eq-id="${eq.equipment_id}" data-type-name="${escapeHtml(displayTypeName)}">
                    <span>${escapeHtml(eq.equipment_name)} ${escapeHtml(displayTypeName)}</span>
                    <input type="number" 
                           min="0" 
                           max="${eq.max_quantity || eq.quantity}" 
                           value="${eq.quantity}" 
                           class="edit-slot-qty" 
                           data-eq-id="${eq.equipment_id}"
                           data-max="${eq.max_quantity || eq.quantity}"
                           style="width: 70px;">
                    <button class="remove-slot-equipment-btn" data-eq-id="${eq.equipment_id}"><i class="fa fa-trash" aria-hidden="true"></i></button>
                </div>
            `;
        });
        
        slotsHtml += `
            <div class="edit-slot-item" data-slot-index="${slotIndex}">
                <div class="edit-slot-header">
                    <div class="edit-slot-time">
                        <i class="fa fa-clock-o" aria-hidden="true"></i> ${startTime} - ${endTime}
                        <input type="hidden" class="edit-slot-start" value="${slot.date_start}">
                        <input type="hidden" class="edit-slot-end" value="${slot.date_end}">
                    </div>
                    <button class="remove-slot-btn" data-slot-index="${slotIndex}" title="Удалить слот"><i class="fa fa-trash" aria-hidden="true"></i> Удалить слот</button>
                </div>
                <div class="edit-slot-equipment-list">
                    ${equipmentHtml || '<div class="text-muted">Нет оборудования</div>'}
                </div>
                <button class="add-equipment-to-slot-btn" data-slot-index="${slotIndex}">Добавить оборудование</button>
            </div>
        `;
    });
    
    return slotsHtml;
};

// Генерация HTML модального окна для слотов
const generateSlotsEditModalHtml = (item, slotsHtml) => {
    return `
        <div class="edit-slots-container">
            <div class="edit-location-info">
                <p><strong><i class="fa fa-map-pin" aria-hidden="true"></i> Локация:</strong> ${escapeHtml(item.location_name)}</p>
                <div class="date-fields" style="margin-top: 1rem; padding: 0;">
                    <div class="date-field">
                        <label><i class="fa fa-calendar"></i> Общая дата начала</label>
                        <input type="datetime-local" id="editSlotsCommonStart" class="date-input" value="${formatDateTimeForInput(item.common_date_start)}">
                    </div>
                    <div class="date-field">
                        <label><i class="fa fa-clock-o" aria-hidden="true"></i> Общая дата окончания</label>
                        <input type="datetime-local" id="editSlotsCommonEnd" class="date-input" value="${formatDateTimeForInput(item.common_date_end)}">
                    </div>
                </div>
            </div>
            <div class="edit-comment-section">
                <label><i class="fa fa-comment-o" aria-hidden="true"></i> Комментарий к заказу</label>
                <textarea id="editSlotsComment" class="edit-comment-input" rows="2">${escapeHtml(item.comment || '')}</textarea>
            </div>
            <div class="edit-slots-list">
                <h4><i class="fa fa-file-text-o" aria-hidden="true"></i> Слоты</h4>
                ${slotsHtml}
            </div>
            <button id="addNewSlotToEdit" class="btn btn-sm btn-main btn-main-green" style="margin-top: 1rem;">Добавить новый слот</button>
        </div>
    `;
};

// Сохранение изменений слотов
export const saveEditedSlots = () => {
    if (currentEditIndex === null) return;
    
    const item = state.orderCart[currentEditIndex];
    if (!item || item.type !== 'slots') return;
    
    const newCommonStart = $('#editSlotsCommonStart').val();
    const newCommonEnd = $('#editSlotsCommonEnd').val();
    const newComment = $('#editSlotsComment').val();
    
    const newSlots = [];
    let hasError = false;
    
    $('.edit-slot-item').each(function(index) {
        const $slot = $(this);
        
        let dateStart = $slot.find('.edit-slot-start-input').val();
        let dateEnd = $slot.find('.edit-slot-end-input').val();
        
        if (!dateStart) dateStart = $slot.find('.edit-slot-start').val();
        if (!dateEnd) dateEnd = $slot.find('.edit-slot-end').val();
        
        if (!dateStart || !dateEnd) {
            showNotification(`Ошибка: не указаны даты для слота ${index + 1}`, 'error');
            hasError = true;
            return false;
        }
        
        const convertedStart = convertToServerDateFormat(dateStart);
        const convertedEnd = convertToServerDateFormat(dateEnd);
        
        const startDate = new Date(convertedStart);
        const endDate = new Date(convertedEnd);
        const now = new Date();
        
        if (startDate < now) {
            showNotification(`Дата начала слота ${index + 1} не может быть в прошлом`, 'error');
            hasError = true;
            return false;
        }
        if (endDate <= startDate) {
            showNotification(`Дата окончания слота ${index + 1} должна быть позже начала`, 'error');
            hasError = true;
            return false;
        }
        
        const equipment = [];
        $slot.find('.edit-slot-equipment-item').each(function() {
            const eqId = $(this).data('eq-id');
            const eqName = $(this).find('span').first().text().split('(')[0].trim();
            let eqType = $(this).data('type-name');
            if (!eqType) {
                eqType = $(this).find('span').first().text().match(/\((.*?)\)/)?.[1] || 'Оборудование';
            }
            const quantity = parseInt($(this).find('.edit-slot-qty').val());
            
            if (quantity > 0) {
                equipment.push({
                    equipment_id: eqId,
                    equipment_name: eqName,
                    type_name: eqType,
                    quantity: quantity,
                    max_quantity: quantity,
                    is_common: false
                });
            }
        });
        
        if (equipment.length === 0) {
            showNotification(`Слот ${index + 1} не содержит оборудования`, 'warning');
            hasError = true;
            return false;
        }
        
        newSlots.push({
            date_start: convertedStart,
            date_end: convertedEnd,
            equipment: equipment
        });
    });
    
    if (hasError) return;
    if (newSlots.length === 0) {
        showNotification('Добавьте хотя бы один слот', 'warning');
        return;
    }
    
    item.common_date_start = newCommonStart;
    item.common_date_end = newCommonEnd;
    item.comment = newComment;
    item.slots = newSlots;
    
    state.orderCart[currentEditIndex] = item;
    saveCart();
    updateCartDisplay();
    
    $('#editOrderModal').hide();
    setCurrentEditIndex(null);
    showNotification('Слоты успешно обновлены', 'success');
};

// Привязка обработчиков для редактирования слотов
const bindEditSlotsHandlers = () => {
    $('#saveEditBtn').off('click').on('click', () => {
        saveEditedSlots();
    });
    
    $('.remove-slot-btn').off('click').on('click', function() {
        const slotIndex = $(this).data('slot-index');
        $(`.edit-slot-item[data-slot-index="${slotIndex}"]`).remove();
        reindexSlots();
        showNotification('Слот удален', 'info');
    });
    
    $('.remove-slot-equipment-btn').off('click').on('click', function() {
        $(this).closest('.edit-slot-equipment-item').remove();
        showNotification('Оборудование удалено из слота', 'info');
    });
    
    $('.edit-slot-qty').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
    });
    
    $('.add-equipment-to-slot-btn').off('click').on('click', function() {
        const slotIndex = $(this).data('slot-index');
        openAddEquipmentForSlot(parseInt(slotIndex));
    });
    
    $('#addNewSlotToEdit').off('click').on('click', () => {
        addNewEmptySlotToEdit();
    });
};

// Переиндексация слотов после удаления
const reindexSlots = () => {
    $('.edit-slot-item').each(function(index) {
        $(this).attr('data-slot-index', index);
        $(this).find('.remove-slot-btn').attr('data-slot-index', index);
        $(this).find('.add-equipment-to-slot-btn').attr('data-slot-index', index);
    });
};

// Добавление нового пустого слота в режиме редактирования
const addNewEmptySlotToEdit = () => {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60000);
    
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };
    
    const startFormatted = formatDateTime(now);
    const endFormatted = formatDateTime(nextHour);
    const slotIndex = $('.edit-slot-item').length;
    
    const slotHtml = `
        <div class="edit-slot-item" data-slot-index="${slotIndex}">
            <div class="edit-slot-header">
                <div class="edit-slot-time">
                    <input type="datetime-local" class="edit-slot-start-input" value="${startFormatted.replace(' ', 'T')}" style="width: 160px;">
                    -
                    <input type="datetime-local" class="edit-slot-end-input" value="${endFormatted.replace(' ', 'T')}" style="width: 160px;">
                </div>
                <button class="remove-slot-btn" data-slot-index="${slotIndex}" title="Удалить слот"><i class="fa fa-trash" aria-hidden="true"></i> Удалить слот</button>
            </div>
            <div class="edit-slot-equipment-list">
                <div class="text-muted">Нет оборудования</div>
            </div>
            <button class="add-equipment-to-slot-btn" data-slot-index="${slotIndex}">Добавить оборудование</button>
        </div>
    `;
    
    $('.edit-slots-list').append(slotHtml);
    bindEditSlotsHandlers();
    showNotification('Новый слот добавлен', 'success');
};