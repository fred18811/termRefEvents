import { state, saveCart, clearCart } from '../state.js';
import { showNotification } from '../utils.js';
import { api } from '../api.js';
import { updateCartDisplay } from './cartDisplay.js';
import { availableEquipment, currentEditIndex, setCurrentEditIndex } from './cartUtils.js';

// Сохранение изменений обычного заказа
export const saveEditedOrder = () => {
    if (currentEditIndex === null) return;
    
    const item = state.orderCart[currentEditIndex];
    if (!item || item.type === 'slots') return;
    
    const newDateStart = $('#editDateStart').val();
    const newDateEnd = $('#editDateEnd').val();
    const newComment = $('#editComment').val();
    
    if (!newDateStart || !newDateEnd) {
        showNotification('Пожалуйста, выберите даты', 'error');
        return;
    }
    
    const startDate = new Date(newDateStart);
    const endDate = new Date(newDateEnd);
    const now = new Date();
    
    if (startDate < now) {
        showNotification('Дата начала не может быть в прошлом', 'error');
        return;
    }
    if (endDate <= startDate) {
        showNotification('Дата окончания должна быть позже даты начала', 'error');
        return;
    }
    
    const newEquipment = [];
    let hasError = false;
    
    $('.edit-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        const newQty = parseInt($(this).find('.edit-qty-input').val());
        const isCommon = $(this).data('is-common') || false;
        
        let equipment = availableEquipment.find(e => e.equipment_id == eqId);
        
        if (equipment) {
            if (newQty > equipment.quantity) {
                showNotification(`Недостаточно оборудования "${equipment.name}". Доступно: ${equipment.quantity} шт.`, 'error');
                hasError = true;
                return false;
            }
            
            if (newQty > 0) {
                newEquipment.push({
                    equipment_id: equipment.equipment_id,
                    equipment_name: equipment.name,
                    type_name: equipment.type_name,
                    quantity: newQty,
                    max_quantity: equipment.quantity,
                    is_common: equipment.is_common || false
                });
            }
        } else {
            const name = $(this).find('.edit-equipment-name').clone().children().remove().end().text().trim();
            const typeName = $(this).find('.edit-equipment-type').text().replace('📌 ', '').trim();
            
            if (newQty > 0) {
                newEquipment.push({
                    equipment_id: eqId,
                    equipment_name: name,
                    type_name: typeName,
                    quantity: newQty,
                    max_quantity: newQty,
                    is_common: isCommon
                });
            }
        }
    });
    
    if (hasError) return;
    
    if (newEquipment.length === 0) {
        showNotification('Добавьте хотя бы одно оборудование', 'warning');
        return;
    }
    
    item.date_start = newDateStart;
    item.date_end = newDateEnd;
    item.comment = newComment;
    item.equipment = newEquipment;
    
    state.orderCart[currentEditIndex] = item;
    saveCart();
    updateCartDisplay();
    
    $('#editOrderModal').hide();
    setCurrentEditIndex(null);
    showNotification('Заказ успешно обновлен', 'success');
};

// Сохранение заказа (создание заявки и заказа)
export const saveSingleOrder = async () => {
    if (!state.orderCart.length) {
        showNotification('<i class="fa fa-exclamation" aria-hidden="true"></i> Нет позиций для сохранения', 'warning');
        return;
    }
    
    const applicationName = $('#applicationName').val().trim();
    if (!applicationName) {
        showNotification('<i class="fa fa-exclamation" aria-hidden="true"></i> Укажите название заявки', 'warning');
        $('#applicationName').addClass('error');
        return;
    }
    $('#applicationName').removeClass('error');
    
    const applicationComment = $('#orderComment').val().trim();
    const appDateStart = $('#dateStart').val();
    const appDateEnd = $('#dateEnd').val();
    
    const saveBtn = $('#saveOrderFromCartBtn');
    const originalText = saveBtn.text();
    saveBtn.prop('disabled', true).text('<i class="fa fa-hourglass-half" aria-hidden="true"></i> Сохранение...');
    
    try {
        const csrftoken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
        
        let createdOrders = [];
        let hasErrors = false;
        let createdApplicationId = null;
        
        for (let i = 0; i < state.orderCart.length; i++) {
            const cartItem = state.orderCart[i];
            const result = await saveOrderItem(cartItem, i, applicationName, applicationComment, appDateStart, appDateEnd, createdApplicationId, csrftoken);
            
            if (result.success) {
                if (i === 0 && result.application_id) {
                    createdApplicationId = result.application_id;
                }
                createdOrders.push(result.orderInfo);
            } else {
                hasErrors = true;
            }
        }
        
        if (createdOrders.length > 0) {
            showSaveSuccessMessage(applicationName, createdOrders);
            clearCartAndReset();
        } else {
            showNotification('❌ Не удалось создать ни одного заказа', 'error');
        }
        
        if (hasErrors) {
            showNotification('<i class="fa fa-exclamation" aria-hidden="true"></i> Некоторые заказы не были созданы.', 'warning');
        }
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification(`❌ ${error.message || 'Ошибка при сохранении'}`, 'error');
    } finally {
        saveBtn.prop('disabled', false).text(originalText);
    }
};

// Сохранение отдельного элемента заказа
const saveOrderItem = async (cartItem, index, applicationName, applicationComment, appDateStart, appDateEnd, createdApplicationId, csrftoken) => {
    console.log(`Обработка позиции "${cartItem.location_name}"`);
    
    let orderData;
    
    if (cartItem.type === 'slots') {
        orderData = {
            type: 'slots',
            date_time_start: cartItem.common_date_start,
            date_time_end: cartItem.common_date_end,
            comment: cartItem.comment || '',
            location_id: cartItem.location_id,
            slots: cartItem.slots,
            application_comment: applicationComment
        };
        
        if (index === 0) {
            orderData.application_name = applicationName;
            orderData.application_comment = applicationComment;
            orderData.application_date_start = appDateStart;
            orderData.application_date_end = appDateEnd;
        } else if (createdApplicationId) {
            orderData.application_id = createdApplicationId;
        }
    } else {
        orderData = {
            date_time_start: cartItem.date_start,
            date_time_end: cartItem.date_end,
            comment: cartItem.comment || '',
            location_id: cartItem.location_id,
            items: cartItem.equipment.map(equip => ({
                equipment_id: equip.equipment_id,
                quantity: equip.quantity,
                is_common: equip.is_common || false,
                ...(!equip.is_common && { location_id: cartItem.location_id })
            }))
        };
        
        if (index === 0) {
            orderData.application_name = applicationName;
            orderData.application_comment = applicationComment;
            orderData.application_date_start = appDateStart;
            orderData.application_date_end = appDateEnd;
        } else if (createdApplicationId) {
            orderData.application_id = createdApplicationId;
        }
    }
    
    const response = await fetch('/api/save-order/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrftoken
        },
        credentials: 'include',
        body: JSON.stringify(orderData)
    });
    
    const data = await response.json();
    
    if (data.success) {
        return {
            success: true,
            application_id: data.application_id,
            orderInfo: {
                location_name: cartItem.location_name,
                order_id: data.order_id,
                slots_count: cartItem.type === 'slots' ? cartItem.slots.length : null,
                comment: cartItem.comment
            }
        };
    } else {
        showNotification(`❌ Ошибка при создании заказа для "${cartItem.location_name}": ${data.error}`, 'error');
        return { success: false };
    }
};

// Показ сообщения об успешном сохранении
const showSaveSuccessMessage = (applicationName, createdOrders) => {
    let message = `✅ Заявка "${applicationName}" создана!\n`;
    message += `Создано заказов: ${createdOrders.length}\n`;
    createdOrders.forEach(order => {
        if (order.slots_count) {
            message += `\n📦 ${order.location_name} - Заказ №${order.order_id} (${order.slots_count} слотов)`;
        } else {
            message += `\n📦 ${order.location_name} - Заказ №${order.order_id}`;
        }
        if (order.comment) {
            message += `\n   <i class="fa fa-comment-o" aria-hidden="true"></i> ${order.comment.substring(0, 50)}${order.comment.length > 50 ? '...' : ''}`;
        }
    });
    showNotification(message, 'success');
};

// Очистка корзины и сброс формы после сохранения
const clearCartAndReset = () => {
    clearCart();
    $('#applicationName').val('');
    $('#orderComment').val('');
    updateCartDisplay();
    $('.location-item').removeClass('disabled');
    $('#dateStart, #dateEnd').val('');
    $('#rentalDateStart, #rentalDateEnd').val('');
    $('#slotDateStart, #slotDateEnd').val('');
    
    if (typeof window.clearAllSlots === 'function') {
        window.clearAllSlots();
    }
};

// Глобальные функции
window.saveSingleOrder = saveSingleOrder;
window.saveEditedOrder = saveEditedOrder;