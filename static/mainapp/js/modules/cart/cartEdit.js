import { state, saveCart } from '../state.js';
import { escapeHtml, showNotification } from '../utils.js';
import { api } from '../api.js';
import { updateCartDisplay } from './cartDisplay.js';
import { 
    availableEquipment, 
    setAvailableEquipment,
    currentEditIndex, 
    setCurrentEditIndex,
    formatDateTimeForInput,
    loadAvailableEquipment
} from './cartUtils.js';
import { openAddEquipmentModal, addSelectedEquipment, bindEquipmentQuantityHandlers, bindRemoveEquipmentHandlers } from './cartEquipment.js';
import { saveEditedOrder } from './cartSave.js';

// Открытие модального окна редактирования обычного заказа
export const openEditModal = async (index) => {
    setCurrentEditIndex(index);
    const item = state.orderCart[index];
    
    if (!item || item.type === 'slots') return;
    
    console.log('Редактирование заказа из корзины:', item);
    
    await loadAvailableEquipment(item.location_id, item.date_start, item.date_end, index);
    
    const startDate = formatDateTimeForInput(item.date_start);
    const endDate = formatDateTimeForInput(item.date_end);
    
    const availabilityResponse = await api.checkEquipmentAvailability(
        item.location_id, item.date_start, item.date_end, []
    );
    
    let availabilityMap = new Map();
    if (availabilityResponse.success && availabilityResponse.equipment) {
        availabilityResponse.equipment.forEach(eq => {
            availabilityMap.set(eq.equipment_id, {
                available: eq.available,
                quantity: eq.quantity
            });
        });
    }
    
    if (availabilityResponse.success && availabilityResponse.equipment) {
        setAvailableEquipment(availabilityResponse.equipment);
    }
    
    const equipmentHtml = generateEquipmentEditHtml(item, availabilityMap);
    const modalContent = generateEditModalHtml(item, startDate, endDate, equipmentHtml);
    
    $('#editOrderContent').html(modalContent);
    $('#editOrderModal').show();
    
    bindEditModalHandlers();
};

// Генерация HTML для оборудования в модальном окне
const generateEquipmentEditHtml = (item, availabilityMap) => {
    let equipmentHtml = '<div class="edit-equipment-list">';
    
    if (item.equipment && item.equipment.length > 0) {
        item.equipment.forEach((eq) => {
            const availability = availabilityMap.get(eq.equipment_id);
            const availableQty = availability ? availability.available : eq.max_quantity;
            const currentQty = Math.min(eq.quantity, availableQty);
            const commonBadge = eq.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
            
            equipmentHtml += `
                <div class="edit-equipment-item" data-eq-id="${eq.equipment_id}" data-is-common="${eq.is_common || false}">
                    <div class="edit-equipment-info">
                        <div class="edit-equipment-name">
                            ${escapeHtml(eq.equipment_name)}
                            ${commonBadge}
                        </div>
                        <div class="edit-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="edit-equipment-available">
                            📦 Всего: <span class="total-qty">${eq.max_quantity || eq.quantity}</span> шт. | 
                            📦 Доступно: <strong class="available-qty ${availableQty <= 0 ? 'text-danger' : 'text-success'}">${availableQty}</strong> шт.
                        </div>
                    </div>
                    <div class="edit-equipment-control">
                        <input type="number" 
                               min="0" 
                               max="${availableQty}" 
                               value="${currentQty}" 
                               class="edit-qty-input" 
                               data-eq-id="${eq.equipment_id}"
                               data-is-common="${eq.is_common || false}"
                               data-max="${availableQty}">
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить"><i class="fa fa-trash" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
        });
    } else {
        equipmentHtml += '<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>';
    }
    equipmentHtml += '</div>';
    
    return equipmentHtml;
};

// Генерация HTML модального окна редактирования
const generateEditModalHtml = (item, startDate, endDate, equipmentHtml) => {
    const commentValue = item.comment || '';
    const escapedComment = commentValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    return `
        <div class="edit-location-info">
            <p><strong><i class="fa fa-map-pin" aria-hidden="true"></i> Локация:</strong> ${escapeHtml(item.location_name)}</p>
            <div class="date-fields" style="margin-top: 1rem; padding: 0;">
                <div class="date-field">
                    <label><i class="fa fa-calendar"></i> Дата начала</label>
                    <input type="datetime-local" id="editDateStart" class="date-input" value="${startDate}">
                </div>
                <div class="date-field">
                    <label><i class="fa fa-clock-o" aria-hidden="true"></i> Дата окончания</label>
                    <input type="datetime-local" id="editDateEnd" class="date-input" value="${endDate}">
                </div>
            </div>
        </div>
        <div class="edit-comment-section">
            <label><i class="fa fa-comment-o" aria-hidden="true"></i> Комментарий к заказу</label>
            <textarea id="editComment" class="edit-comment-input" rows="3" placeholder="Введите комментарий...">${escapedComment}</textarea>
        </div>
        <div class="edit-equipment-header">
            <h4>🔧 Оборудование</h4>
            <button id="addMoreEquipmentBtn" class="add-equipment-btn">➕ Добавить оборудование</button>
        </div>
        ${equipmentHtml}
    `;
};

// Привязка обработчиков для модального окна редактирования
const bindEditModalHandlers = () => {
    $('#saveEditBtn').off('click').on('click', () => {
        saveEditedOrder();
    });
    
    bindEquipmentQuantityHandlers();
    bindRemoveEquipmentHandlers();
    
    $('#addMoreEquipmentBtn').off('click').on('click', () => {
        openAddEquipmentModal();
    });
    
    $('#editDateStart, #editDateEnd').off('change').on('change', async function() {
        const newStart = $('#editDateStart').val();
        const newEnd = $('#editDateEnd').val();
        
        if (newStart && newEnd && currentEditIndex !== null) {
            const item = state.orderCart[currentEditIndex];
            if (item) {
                const availabilityResponse = await api.checkEquipmentAvailability(
                    item.location_id, newStart, newEnd, []
                );
                
                if (availabilityResponse.success && availabilityResponse.equipment) {
                    const availabilityMap = new Map();
                    availabilityResponse.equipment.forEach(eq => {
                        availabilityMap.set(eq.equipment_id, eq.available);
                    });
                    
                    $('.edit-equipment-item').each(function() {
                        const eqId = $(this).data('eq-id');
                        const newAvailable = availabilityMap.get(eqId);
                        if (newAvailable !== undefined) {
                            $(this).find('.available-qty').text(newAvailable);
                            $(this).find('.edit-qty-input')
                                .attr('max', newAvailable)
                                .data('max', newAvailable);
                            
                            const currentVal = parseInt($(this).find('.edit-qty-input').val());
                            if (currentVal > newAvailable) {
                                $(this).find('.edit-qty-input').val(newAvailable);
                            }
                        }
                    });
                }
            }
        }
    });
};

// Экспортируем функцию saveEditedOrder из cartSave (для обратной совместимости)
export { saveEditedOrder } from './cartSave.js';