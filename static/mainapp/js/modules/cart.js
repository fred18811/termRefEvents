// static/mainapp/js/modules/cart.js

import { state, saveCart, clearCart } from './state.js';
import { escapeHtml, formatDate, showNotification, validateDates } from './utils.js';
import { api } from './api.js';
import { showConfirm } from './modal.js';


let currentEditIndex = null;
let availableEquipment = [];

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
    
    countSpan.text(state.orderCart.length);
    
    let totalItems = 0;
    let totalEquipment = 0;
    
    state.orderCart.forEach(item => {
        totalEquipment += item.equipment.length;
        totalItems += item.equipment.reduce((s, e) => s + e.quantity, 0);
    });
    
    let html = '';
    
    state.orderCart.forEach((item, i) => {
        const startDate = new Date(item.date_start).toLocaleString('ru-RU');
        const endDate = new Date(item.date_end).toLocaleString('ru-RU');
        
        html += `
            <div class="cart-item" data-index="${i}">
                <div class="cart-item-info">
                    <div class="cart-item-location" data-index="${i}">
                        📍 ${escapeHtml(item.location_name)}
                    </div>
                    <div class="cart-item-dates">
                        📅 ${startDate} - ${endDate}
                    </div>
                    <div class="cart-item-equipment">
                        ${item.equipment.map(e => `• ${escapeHtml(e.equipment_name)}: ${e.quantity} шт.`).join('<br>')}
                    </div>
                    ${item.comment ? `<div class="cart-item-comment">💬 ${escapeHtml(item.comment)}</div>` : ''}
                </div>
                <div class="cart-item-actions">
                    <button class="cart-edit-btn" data-index="${i}" title="Редактировать">✏️</button>
                    <button class="cart-remove-btn" data-index="${i}" title="Удалить">🗑️</button>
                </div>
            </div>
        `;
    });
    
    container.html(html);
    
    $('.cart-edit-btn').click(function() {
        const index = $(this).data('index');
        openEditModal(index);
    });
    
    $('.cart-remove-btn').click(function() {
        const index = $(this).data('index');
        removeCartItem(index);
    });
    
    $('.cart-item-location').click(function() {
        const index = $(this).data('index');
        openEditModal(index);
    });
};

// Удаление элемента из корзины
const removeCartItem = (index) => {
    if (confirm('Удалить этот заказ из корзины?')) {
        const removedItem = state.orderCart[index];
        state.orderCart.splice(index, 1);
        
        if (removedItem.location_id) {
            state.selectedLocations.delete(removedItem.location_id.toString());
            $(`.location-item[data-id="${removedItem.location_id}"]`).removeClass('disabled');
        }
        
        saveCart();
        updateCartDisplay();
        showNotification(`Заказ для "${removedItem.location_name}" удален`, 'info');
    }
};

// Загрузка доступного оборудования (включая общее) с учетом дат
const loadAvailableEquipment = async (locationId, dateStart = null, dateEnd = null) => {
    try {
        // Если даты не переданы, используем даты из заказа
        if (!dateStart && currentEditIndex !== null) {
            const item = state.orderCart[currentEditIndex];
            if (item) {
                dateStart = item.date_start;
                dateEnd = item.date_end;
            }
        }
        
        let allEquipment = [];
        
        // Загружаем оборудование из локации
        const locationResponse = await $.ajax({
            url: '/api/equipment-by-location/',
            method: 'GET',
            data: {
                location_id: locationId,
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
        
        // Если есть даты, получаем актуальное доступное количество
        if (dateStart && dateEnd) {
            const availabilityResponse = await api.checkEquipmentAvailability(
                locationId,
                dateStart,
                dateEnd,
                []
            );
            
            if (availabilityResponse.success && availabilityResponse.equipment) {
                const availabilityMap = new Map();
                availabilityResponse.equipment.forEach(eq => {
                    availabilityMap.set(eq.equipment_id, eq.available);
                });
                
                allEquipment = allEquipment.map(eq => ({
                    ...eq,
                    available: availabilityMap.get(eq.equipment_id) || eq.quantity,
                    max_quantity: availabilityMap.get(eq.equipment_id) || eq.quantity
                }));
            }
        }
        
        availableEquipment = allEquipment;
        console.log('Загружено доступное оборудование:', availableEquipment);
        return availableEquipment;
    } catch (error) {
        console.error('Ошибка загрузки оборудования:', error);
        availableEquipment = [];
        return [];
    }
};

// Открытие модального окна редактирования
const openEditModal = async (index) => {
    currentEditIndex = index;
    const item = state.orderCart[index];
    
    if (!item) return;
    
    console.log('Редактирование заказа:', item);
    console.log('Комментарий из заказа:', item.comment);
    
    // Загружаем актуальную информацию о доступности оборудования
    await loadAvailableEquipment(item.location_id);
    
    // Получаем актуальные даты из заказа
    const startDate = new Date(item.date_start).toISOString().slice(0, 16);
    const endDate = new Date(item.date_end).toISOString().slice(0, 16);
    
    // Загружаем актуальное доступное количество для каждого оборудования
    const availabilityResponse = await api.checkEquipmentAvailability(
        item.location_id,
        item.date_start,
        item.date_end,
        []
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
    
    console.log('Карта доступности:', availabilityMap);
    
    // Формируем HTML для оборудования с актуальным доступным количеством
    let equipmentHtml = '<div class="edit-equipment-list">';
    if (item.equipment && item.equipment.length > 0) {
        item.equipment.forEach((eq, eqIndex) => {
            const availability = availabilityMap.get(eq.equipment_id);
            const availableQty = availability ? availability.available : eq.max_quantity;
            const currentQty = Math.min(eq.quantity, availableQty);
            const commonBadge = eq.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
            
            equipmentHtml += `
                <div class="edit-equipment-item" data-eq-id="${eq.equipment_id}" data-eq-index="${eqIndex}" data-is-common="${eq.is_common || false}">
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
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        });
    } else {
        equipmentHtml += '<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>';
    }
    equipmentHtml += '</div>';
    
    const commentValue = item.comment || '';
    const escapedComment = commentValue.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const modalContent = `
        <div class="edit-location-info">
            <p><strong>📍 Локация:</strong> ${escapeHtml(item.location_name)}</p>
            <div class="date-fields" style="margin-top: 1rem; padding: 0;">
                <div class="date-field">
                    <label>📅 Дата начала</label>
                    <input type="datetime-local" id="editDateStart" class="date-input" value="${startDate}">
                </div>
                <div class="date-field">
                    <label>⏰ Дата окончания</label>
                    <input type="datetime-local" id="editDateEnd" class="date-input" value="${endDate}">
                </div>
            </div>
        </div>
        <div class="edit-comment-section">
            <label>💬 Комментарий к заказу</label>
            <textarea id="editComment" class="edit-comment-input" rows="3" placeholder="Введите комментарий...">${escapedComment}</textarea>
        </div>
        <div class="edit-equipment-header">
            <h4>🔧 Оборудование</h4>
            <button id="addMoreEquipmentBtn" class="add-equipment-btn">➕ Добавить оборудование</button>
        </div>
        ${equipmentHtml}
    `;
    
    $('#editOrderContent').html(modalContent);
    $('#editOrderModal').show();
    
    // Обновляем availableEquipment для добавления новых позиций
    if (availabilityResponse.success && availabilityResponse.equipment) {
        availableEquipment = availabilityResponse.equipment;
    }

    // ========== ПРЯМАЯ ПРИВЯЗКА КНОПОК ==========
    
    // Кнопка "Сохранить изменения"
    $('#saveEditBtn').off('click').on('click', function() {
        console.log('Кнопка "Сохранить изменения" нажата');
        saveEditChanges();
    });
    
    // Обработчики для полей ввода
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
    
    $('.remove-equipment-btn').off('click').click(function() {
        const eqId = $(this).data('eq-id');
        removeEquipmentFromEdit(eqId);
    });
    
    $('#addMoreEquipmentBtn').off('click').click(() => {
        openAddEquipmentModal();
    });
    
    // Обработчик изменения дат в модальном окне
    $('#editDateStart, #editDateEnd').off('change').on('change', async function() {
        const newStart = $('#editDateStart').val();
        const newEnd = $('#editDateEnd').val();
        
        if (newStart && newEnd) {
            const item = state.orderCart[currentEditIndex];
            if (item) {
                const availabilityResponse = await api.checkEquipmentAvailability(
                    item.location_id,
                    newStart,
                    newEnd,
                    []
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
    
    console.log('Установлен комментарий в textarea:', $('#editComment').val());
};

// Удаление оборудования из редактируемого заказа
const removeEquipmentFromEdit = (equipmentId) => {
    $(`.edit-equipment-item[data-eq-id="${equipmentId}"]`).remove();
    showNotification('Оборудование удалено', 'info');
    
    if ($('.edit-equipment-item').length === 0) {
        $('.edit-equipment-list').html('<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>');
    }
};

// Открытие модального окна добавления оборудования
const openAddEquipmentModal = () => {
    console.log('openAddEquipmentModal вызвана');
    console.log('availableEquipment:', availableEquipment);
    
    if (!availableEquipment.length) {
        showNotification('Нет доступного оборудования для этой локации', 'warning');
        return;
    }
    
    const addedIds = [];
    $('.edit-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        if (eqId) addedIds.push(parseInt(eqId));
    });
    
    console.log('Уже добавленные ID:', addedIds);
    
    let html = '<div class="available-equipment-list">';
    let hasAvailable = false;
    
    availableEquipment.forEach(eq => {
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
    
    const selectedItems = [];
    
    $('.available-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        const qty = parseInt($(this).find('.equipment-select-qty').val());
        const isCommon = $(this).data('is-common') || false;
        
        if (qty > 0) {
            const equipment = availableEquipment.find(e => e.equipment_id == eqId);
            
            if (equipment) {
                selectedItems.push({
                    equipment_id: equipment.equipment_id,
                    equipment_name: equipment.name,
                    type_name: equipment.type_name,
                    quantity: qty,
                    max_quantity: equipment.quantity,
                    is_common: isCommon || equipment.is_common || false
                });
            }
        }
    });
    
    console.log('Выбранные элементы для добавления:', selectedItems);
    
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
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
            $('.edit-equipment-list').append(newItemHtml);
        }
    });
    
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
    
    $('.remove-equipment-btn').off('click').click(function() {
        const eqId = $(this).data('eq-id');
        removeEquipmentFromEdit(eqId);
    });
    
    $('#addEquipmentModal').hide();
    showNotification(`Добавлено ${selectedItems.length} позиций`, 'success');
};

// Сохранение изменений заказа
export const saveEditChanges = () => {
    if (currentEditIndex === null) return;
    
    const item = state.orderCart[currentEditIndex];
    if (!item) return;
    
    const newDateStart = $('#editDateStart').val();
    const newDateEnd = $('#editDateEnd').val();
    const newComment = $('#editComment').val();
    
    console.log('Сохранение изменений:', { newDateStart, newDateEnd, newComment });
    
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
    currentEditIndex = null;
    showNotification('Заказ успешно обновлен', 'success');
};

// Сохранение заказа (создание заявки и заказа)

// Сохранение заказа (создание заявки и заказа)
export const saveSingleOrder = async () => {
    if (!state.orderCart.length) {
        showNotification('⚠️ Нет позиций для сохранения', 'warning');
        return;
    }
    
    const applicationName = $('#applicationName').val().trim();
    if (!applicationName) {
        showNotification('⚠️ Укажите название заявки', 'warning');
        $('#applicationName').addClass('error');
        return;
    }
    $('#applicationName').removeClass('error');
    
    // Комментарий к заявке (общий для всей заявки)
    const applicationComment = $('#orderComment').val().trim();
    
    console.log('Количество локаций в корзине:', state.orderCart.length);
    console.log('Комментарий к заявке:', applicationComment);
    
    const saveBtn = $('#saveOrderFromCartBtn');
    const originalText = saveBtn.text();
    saveBtn.prop('disabled', true).text('⏳ Сохранение...');
    
    try {
        const csrftoken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
        
        // 1. Создаем ОДНУ заявку для всех заказов
        console.log('Шаг 1: Создание заявки...');
        const applicationResponse = await fetch('/api/applications/create/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'include',
            body: JSON.stringify({
                name: applicationName,
                comment: applicationComment
            })
        });
        
        const applicationData = await applicationResponse.json();
        console.log('Ответ сервера (заявка):', applicationData);
        
        if (!applicationData.success) {
            throw new Error(applicationData.error || 'Ошибка создания заявки');
        }
        
        const applicationId = applicationData.application.id;
        console.log('Создана заявка №', applicationId);
        
        // 2. Создаем отдельный заказ для КАЖДОЙ локации
        let createdOrders = [];
        let hasErrors = false;
        
        for (let i = 0; i < state.orderCart.length; i++) {
            const cartItem = state.orderCart[i];
            // Комментарий к заказу (индивидуальный для каждой локации)
            const orderComment = cartItem.comment || '';
            console.log(`\nШаг 2.${i + 1}: Создание заказа для локации "${cartItem.location_name}"`);
            console.log(`  Комментарий к заказу: ${orderComment}`);
            
            // Формируем данные для заказа этой локации
            const orderData = {
                date_time_start: cartItem.date_start,
                date_time_end: cartItem.date_end,
                comment: orderComment, // Сохраняем комментарий к заказу
                application_id: applicationId,
                location_id: cartItem.location_id,
                items: []
            };
            
            // Добавляем оборудование из этой локации
            for (const equip of cartItem.equipment) {
                const itemData = {
                    equipment_id: equip.equipment_id,
                    quantity: equip.quantity,
                    is_common: equip.is_common || false
                };
                
                if (!equip.is_common) {
                    itemData.location_id = cartItem.location_id;
                }
                
                orderData.items.push(itemData);
                console.log(`    - Оборудование: ${equip.equipment_name}, кол-в ${equip.quantity}, is_common: ${equip.is_common}`);
            }
            
            console.log(`Отправка заказа для локации ${cartItem.location_name}...`);
            
            // Сохраняем заказ
            const orderResponse = await fetch('/api/save-order/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken
                },
                credentials: 'include',
                body: JSON.stringify(orderData)
            });
            
            const orderResponseData = await orderResponse.json();
            console.log(`Ответ для локации ${cartItem.location_name}:`, orderResponseData);
            
            if (orderResponseData.success) {
                createdOrders.push({
                    location_name: cartItem.location_name,
                    order_id: orderResponseData.order_id,
                    comment: orderComment
                });
            } else {
                hasErrors = true;
                showNotification(`❌ Ошибка при создании заказа для "${cartItem.location_name}": ${orderResponseData.error}`, 'error');
            }
        }
        
        // 3. Показываем результат
        if (createdOrders.length > 0) {
            let message = `✅ Заявка "${applicationName}" создана!\n`;
            message += `Создано заказов: ${createdOrders.length}\n`;
            createdOrders.forEach(order => {
                message += `\n📦 ${order.location_name} - Заказ №${order.order_id}`;
                if (order.comment) {
                    message += `\n   💬 ${order.comment.substring(0, 50)}${order.comment.length > 50 ? '...' : ''}`;
                }
            });
            showNotification(message, 'success');
            
            // Очищаем корзину и поля
            clearCart();
            $('#applicationName').val('');
            $('#orderComment').val('');
            updateCartDisplay();
            $('.location-item').removeClass('disabled');
            $('#dateStart, #dateEnd').val('');
        } else {
            showNotification('❌ Не удалось создать ни одного заказа', 'error');
        }
        
        if (hasErrors) {
            showNotification('⚠️ Некоторые заказы не были созданы. Проверьте консоль.', 'warning');
        }
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification(`❌ ${error.message || 'Ошибка при сохранении'}`, 'error');
    } finally {
        saveBtn.prop('disabled', false).text(originalText);
    }
};

// Сохранение нескольких заказов (больше не используется, но оставлено для совместимости)
export const saveMultipleOrders = async (orderItems) => {
    // Этот метод больше не используется, все сохраняется в один заказ
    console.warn('saveMultipleOrders устарел, используйте saveSingleOrder');
    await saveSingleOrder();
};

// Глобальная привязка для доступа из HTML событий
window.saveEditChanges = saveEditChanges;
window.addSelectedEquipment = addSelectedEquipment;