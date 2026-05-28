// static/mainapp/js/modules/cart/cartDisplay.js

import { state, saveCart } from '../state.js';
import { escapeHtml, showNotification } from '../utils.js';
import { 
    availableEquipment, 
    setAvailableEquipment,
    currentEditIndex,
    setCurrentEditIndex,
    groupSlotsByDateForCart,
    removeCartItem,
    loadAvailableEquipment,
    formatDateTimeForInput
} from './cartUtils.js';
import { openEditModal } from './cartEdit.js';
import { openEditSlotsModal, saveEditedSlots } from './cartEditSlots.js';  // Исправлен импорт
import { saveEditedOrder } from './cartSave.js';

// Обновление отображения корзины
export const updateCartDisplay = () => {
    console.log('updateCartDisplay вызван, корзина:', state.orderCart.length);
    
    const container = $('#cartItemsList');
    const countSpan = $('#cartCount');
    
    if (!state.orderCart.length) {
        container.html('<div class="cart-empty">Нет заявок</div>');
        countSpan.text('0');
        return;
    }
    
    let totalSlots = 0;
    state.orderCart.forEach(item => {
        if (item.type === 'slots') {
            totalSlots += item.slots.length;
        } else {
            totalSlots += 1;
        }
    });
    countSpan.text(totalSlots);
    
    let html = '';
    
    state.orderCart.forEach((item, i) => {
        if (item.type === 'slots') {
            html += renderSlotsCartItem(item, i);
        } else {
            html += renderRegularCartItem(item, i);
        }
    });
    
    container.html(html);
    
    // Привязываем обработчики
    bindCartItemHandlers();
};

// Отрисовка обычного заказа в корзине
const renderRegularCartItem = (item, index) => {
    const startDate = new Date(item.date_start).toLocaleString('ru-RU');
    const endDate = new Date(item.date_end).toLocaleString('ru-RU');
    
    return `
        <div class="cart-item" data-index="${index}">
            <div class="cart-item-info">
                <div class="cart-item-location" data-index="${index}">
                    <i class="fa fa-map-pin" aria-hidden="true"></i> ${escapeHtml(item.location_name)}
                </div>
                <div class="cart-item-dates">
                    <i class="fa fa-calendar"></i> ${startDate} - ${endDate}
                </div>
                <div class="cart-item-equipment">
                    ${item.equipment.map(e => `<span>• ${escapeHtml(e.equipment_name)}  -  ${e.quantity} шт.</span>`).join('')}
                </div>
                ${item.comment ? `<div class="cart-item-comment"><i class="fa fa-comment-o" aria-hidden="true"></i> ${escapeHtml(item.comment)}</div>` : ''}
            </div>
            <div class="cart-item-actions">
                <button class="cart-edit-btn" data-index="${index}" title="Редактировать"><i class="fa fa-pencil" aria-hidden="true"></i></button>
                <button class="cart-remove-btn" data-index="${index}" title="Удалить"><i class="fa fa-trash" aria-hidden="true"></i></button>
            </div>
        </div>
    `;
};

// Отрисовка заказа со слотами в корзине
const renderSlotsCartItem = (item, index) => {
    const commonStartDate = item.common_date_start ? new Date(item.common_date_start).toLocaleString('ru-RU') : 'Не указана';
    const commonEndDate = item.common_date_end ? new Date(item.common_date_end).toLocaleString('ru-RU') : 'Не указана';
    const groupedSlots = groupSlotsByDateForCart(item.slots);
    
    let slotsHtml = '';
    for (const [dateKey, slots] of groupedSlots) {
        const dateObj = new Date(dateKey);
        const dateHeader = dateObj.toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        
        slotsHtml += `<div class="slots-date-group-cart">
                        <div class="slots-date-header-cart"><i class="fa fa-calendar"></i> ${dateHeader}</div>`;
        
        slots.forEach(slot => {
            const startTime = new Date(slot.date_start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const endTime = new Date(slot.date_end).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            slotsHtml += `<div class="slot-item-cart">
                            <div class="slot-time-cart"><i class="fa fa-clock-o" aria-hidden="true"></i> ${startTime} - ${endTime}</div>
                            <div class="slot-equipment-cart">`;
            
            slot.equipment.forEach(eq => {
                slotsHtml += `<div class="slot-equipment-item-cart">
                                <span>${escapeHtml(eq.equipment_name)}</span>
                                <span>${eq.quantity} шт.</span>
                            </div>`;
            });
            
            slotsHtml += `</div></div>`;
        });
        
        slotsHtml += `</div>`;
    }
    
    return `
        <div class="cart-item cart-item-slots" data-index="${index}">
            <div class="cart-item-info">
                <div class="cart-item-location" data-index="${index}">
                    <i class="fa fa-map-pin" aria-hidden="true"></i> ${escapeHtml(item.location_name)}
                    <span class="slots-badge"><i class="fa fa-clock-o"></i> Слоты</span>
                </div>
                <div class="cart-item-dates">
                    <i class="fa fa-calendar"></i> ${commonStartDate} - ${commonEndDate}
                </div>
                ${item.comment ? `<div class="cart-item-comment"><i class="fa fa-comment-o" aria-hidden="true"></i> ${escapeHtml(item.comment)}</div>` : ''}
                ${slotsHtml}
            </div>
            <div class="cart-item-actions">
                <button class="cart-edit-slots-btn" data-index="${index}" title="Редактировать слоты"><i class="fa fa-pencil" aria-hidden="true"></i></button>
                <button class="cart-remove-btn" data-index="${index}" title="Удалить"><i class="fa fa-trash" aria-hidden="true"></i></button>
            </div>
        </div>
    `;
};

// Привязка обработчиков к элементам корзины
const bindCartItemHandlers = () => {
    $('.cart-edit-btn').off('click').on('click', function() {
        const index = $(this).data('index');
        openEditModal(index);
    });
    
    $('.cart-edit-slots-btn').off('click').on('click', function() {
        const index = $(this).data('index');
        openEditSlotsModal(index);  // Теперь функция доступна
    });
    
    $('.cart-remove-btn').off('click').on('click', function() {
        const index = $(this).data('index');
        if (removeCartItem(index)) {
            updateCartDisplay();
        }
    });
    
    $('.cart-item-location').off('click').on('click', function() {
        const index = $(this).data('index');
        const item = state.orderCart[index];
        if (item.type !== 'slots') {
            openEditModal(index);
        }
    });
};

// Очистка корзины (глобальная функция)
export const clearCartGlobal = () => {
    if (confirm('Очистить всю корзину?')) {
        import('../state.js').then(module => {
            module.clearCart();
            updateCartDisplay();
            showNotification('Корзина очищена', 'info');
        });
    }
};

// Глобальные функции для доступа из HTML
window.updateCartDisplayGlobal = updateCartDisplay;
window.clearCartGlobal = clearCartGlobal;