import { escapeHtml, showNotification } from '../utils.js';
import { availableEquipment, getAvailableEquipment, currentEditIndex } from './cartUtils.js';
import { updateCartDisplay } from './cartDisplay.js';
import { saveCart } from '../state.js';

// Открытие модального окна добавления оборудования
export const openAddEquipmentModal = () => {
    console.log('openAddEquipmentModal вызвана');
    
    const equipment = getAvailableEquipment();
    
    if (!equipment || !equipment.length) {
        showNotification('Нет доступного оборудования для этой локации', 'warning');
        return;
    }
    
    const addedIds = [];
    $('.edit-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        if (eqId) addedIds.push(parseInt(eqId));
    });
    
    let html = '<div class="available-equipment-list">';
    let hasAvailable = false;
    
    equipment.forEach(eq => {
        const isAlreadyAdded = addedIds.includes(eq.equipment_id);
        if (!isAlreadyAdded) {
            hasAvailable = true;
            const commonBadge = eq.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
            
            html += `
                <div class="available-equipment-item" data-eq-id="${eq.equipment_id}" data-is-common="${eq.is_common || false}">
                    <div>
                        <div class="available-equipment-name">
                            ${escapeHtml(eq.name)}
                            ${commonBadge}
                        </div>
                        <div class="available-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="available-equipment-quantity">📦 Доступно: <strong>${eq.quantity}</strong> шт.</div>
                    </div>
                    <div>
                        <label style="font-size: 0.7rem;">Количество:</label>
                        <input type="number" 
                               min="0" 
                               max="${eq.quantity}" 
                               value="0" 
                               class="equipment-select-qty" 
                               data-eq-id="${eq.equipment_id}" 
                               data-is-common="${eq.is_common || false}"
                               data-max="${eq.quantity}"
                               style="width: 80px; padding: 0.4rem; text-align: center; border-radius: 6px; border: 1px solid #e2e8f0;">
                    </div>
                </div>
            `;
        }
    });
    
    if (!hasAvailable) {
        html = '<div class="text-center" style="padding: 2rem; color: #94a3b8;">Все доступное оборудование уже добавлено</div>';
    }
    html += '</div>';
    
    $('#addEquipmentContent').html(html);
    $('#addEquipmentModal').show();
    
    $('.equipment-select-qty').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
    });
};

// Добавление выбранного оборудования в заказ
export const addSelectedEquipment = () => {
    console.log('addSelectedEquipment вызвана');
    
    const equipment = getAvailableEquipment();
    const selectedItems = [];
    
    $('.available-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        const qty = parseInt($(this).find('.equipment-select-qty').val());
        const isCommon = $(this).data('is-common') || false;
        
        if (qty > 0) {
            const eqData = equipment.find(e => e.equipment_id == eqId);
            
            if (eqData) {
                selectedItems.push({
                    equipment_id: eqData.equipment_id,
                    equipment_name: eqData.name,
                    type_name: eqData.type_name,
                    quantity: qty,
                    max_quantity: eqData.quantity,
                    is_common: isCommon || eqData.is_common || false
                });
            }
        }
    });
    
    if (!selectedItems.length) {
        showNotification('Выберите оборудование и укажите количество больше 0', 'warning');
        return;
    }
    
    if ($('.edit-equipment-list').text().includes('Нет оборудования')) {
        $('.edit-equipment-list').html('');
    }
    
    selectedItems.forEach(eq => {
        if ($(`.edit-equipment-item[data-eq-id="${eq.equipment_id}"]`).length === 0) {
            const commonBadge = eq.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
            
            const newItemHtml = `
                <div class="edit-equipment-item" data-eq-id="${eq.equipment_id}" data-is-common="${eq.is_common}">
                    <div class="edit-equipment-info">
                        <div class="edit-equipment-name">
                            ${escapeHtml(eq.equipment_name)}
                            ${commonBadge}
                        </div>
                        <div class="edit-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="edit-equipment-available">📦 Доступно: <span class="available-qty">${eq.max_quantity}</span> шт.</div>
                    </div>
                    <div class="edit-equipment-control">
                        <input type="number" 
                               min="0" 
                               max="${eq.max_quantity}" 
                               value="${eq.quantity}" 
                               class="edit-qty-input" 
                               data-eq-id="${eq.equipment_id}"
                               data-is-common="${eq.is_common}"
                               data-max="${eq.max_quantity}">
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить"><i class="fa fa-trash" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
            $('.edit-equipment-list').append(newItemHtml);
        }
    });
    
    // Привязываем обработчики к новым элементам
    bindEquipmentQuantityHandlers();
    bindRemoveEquipmentHandlers();
    
    $('#addEquipmentModal').hide();
    showNotification(`Добавлено ${selectedItems.length} позиций`, 'success');
};

// Привязка обработчиков для полей количества оборудования
export const bindEquipmentQuantityHandlers = () => {
    $('.edit-qty-input').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
        
        if (val === max && max > 0) {
            showNotification(`Максимальное количество: ${max} шт.`, 'info');
        }
    });
};

// Привязка обработчиков для удаления оборудования
export const bindRemoveEquipmentHandlers = () => {
    $('.remove-equipment-btn').off('click').on('click', function() {
        const eqId = $(this).data('eq-id');
        $(`.edit-equipment-item[data-eq-id="${eqId}"]`).remove();
        showNotification('Оборудование удалено', 'info');
        
        if ($('.edit-equipment-item').length === 0) {
            $('.edit-equipment-list').html('<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>');
        }
    });
};

// Глобальные функции
window.addSelectedEquipment = addSelectedEquipment;