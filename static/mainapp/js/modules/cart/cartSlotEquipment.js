import { escapeHtml, showNotification } from '../utils.js';
import { availableEquipment, getAvailableEquipment } from './cartUtils.js';

// Открытие модального окна добавления оборудования для слота
export const openAddEquipmentForSlot = (slotIndex) => {
    console.log('openAddEquipmentForSlot: slotIndex=', slotIndex);
    
    const equipment = getAvailableEquipment();
    
    if (!equipment || !equipment.length) {
        showNotification('Нет доступного оборудования', 'warning');
        return;
    }
    
    const index = parseInt(slotIndex);
    const $slotItem = $(`.edit-slot-item[data-slot-index="${index}"]`);
    
    if (!$slotItem.length) {
        console.error('Слот не найден по индексу:', index);
        showNotification('Ошибка: слот не найден', 'error');
        return;
    }
    
    const addedIds = [];
    $slotItem.find('.edit-slot-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        if (eqId) addedIds.push(parseInt(eqId));
    });
    
    let html = '<div class="available-equipment-list">';
    let hasAvailable = false;
    
    equipment.forEach(eq => {
        if (!addedIds.includes(eq.equipment_id)) {
            hasAvailable = true;
            const commonBadge = eq.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
            const displayTypeName = eq.type_name || 'Оборудование';
            
            html += `
                <div class="available-equipment-item" data-eq-id="${eq.equipment_id}" data-is-common="${eq.is_common || false}">
                    <div>
                        <div class="available-equipment-name">
                            ${escapeHtml(eq.name)}
                            ${commonBadge}
                        </div>
                        <div class="available-equipment-type">${escapeHtml(displayTypeName)}</div>
                        <div class="available-equipment-quantity">📦 Доступно: <strong>${eq.quantity}</strong> шт.</div>
                    </div>
                    <div>
                        <label>Количество:</label>
                        <input type="number" 
                               min="0" 
                               max="${eq.quantity}" 
                               value="0"
                               class="equipment-select-qty" 
                               data-max="${eq.quantity}">
                    </div>
                </div>
            `;
        }
    });
    
    if (!hasAvailable) {
        html = '<div class="text-center" style="padding: 2rem;">Все оборудование уже добавлено</div>';
    }
    html += '</div>';
    
    $('#addEquipmentContent').html(html);
    $('#addEquipmentModal').show();
    
    $('#addEquipmentModal').data('current-slot-index', index);
    
    $('#confirmAddEquipmentBtn').off('click').one('click', () => {
        const currentSlotIndex = $('#addEquipmentModal').data('current-slot-index');
        addEquipmentToSlot(currentSlotIndex);
    });
};

// Добавление оборудования в слот
const addEquipmentToSlot = (slotIndex) => {
    const equipment = getAvailableEquipment();
    const index = parseInt(slotIndex);
    const $slotItem = $(`.edit-slot-item[data-slot-index="${index}"]`);
    
    if (!$slotItem.length) {
        showNotification('Ошибка: слот не найден', 'error');
        $('#addEquipmentModal').hide();
        return;
    }
    
    let $equipmentList = $slotItem.find('.edit-slot-equipment-list');
    
    if ($equipmentList.find('.text-muted').length) {
        $equipmentList.html('');
    }
    
    let addedCount = 0;
    
    $('.available-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        const eqName = $(this).find('.available-equipment-name').clone().children().remove().end().text().trim();
        const qty = parseInt($(this).find('.equipment-select-qty').val());
        const maxQty = parseInt($(this).find('.equipment-select-qty').data('max'));
        
        let eqType = $(this).find('.available-equipment-type').text().trim();
        if (!eqType || eqType === 'Оборудование') {
            const eqData = equipment.find(e => e.equipment_id == eqId);
            if (eqData && eqData.type_name) {
                eqType = eqData.type_name;
            }
        }
        
        if (qty > 0) {
            const existing = $equipmentList.find(`.edit-slot-equipment-item[data-eq-id="${eqId}"]`);
            
            if (existing.length) {
                const $input = existing.find('.edit-slot-qty');
                const newQty = parseInt($input.val()) + qty;
                const finalQty = Math.min(newQty, maxQty);
                $input.val(finalQty);
            } else {
                const equipmentHtml = `
                    <div class="edit-slot-equipment-item" data-eq-id="${eqId}" data-type-name="${escapeHtml(eqType)}">
                        <span>${escapeHtml(eqName)} (${escapeHtml(eqType)})</span>
                        <input type="number" 
                               min="0" 
                               max="${maxQty}" 
                               value="${qty}" 
                               class="edit-slot-qty" 
                               data-eq-id="${eqId}"
                               data-max="${maxQty}"
                               style="width: 70px;">
                        <button class="remove-slot-equipment-btn" data-eq-id="${eqId}">🗑️</button>
                    </div>
                `;
                $equipmentList.append(equipmentHtml);
            }
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        bindSlotEquipmentHandlers($equipmentList);
        showNotification(`Добавлено ${addedCount} позиций`, 'success');
    } else {
        if ($equipmentList.children().length === 0) {
            $equipmentList.html('<div class="text-muted">Нет оборудования</div>');
        }
        showNotification('Выберите оборудование для добавления (укажите количество больше 0)', 'warning');
    }
    
    $('#addEquipmentModal').hide();
};

// Привязка обработчиков для оборудования в слотах
const bindSlotEquipmentHandlers = ($container) => {
    $container.find('.edit-slot-qty').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
    });
    
    $container.find('.remove-slot-equipment-btn').off('click').on('click', function() {
        $(this).closest('.edit-slot-equipment-item').remove();
        if ($container.children().length === 0) {
            $container.html('<div class="text-muted">Нет оборудования</div>');
        }
        showNotification('Оборудование удалено из слота', 'info');
    });
};