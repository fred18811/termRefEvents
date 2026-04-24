'use strict';

import { state } from './state.js';
import { escapeHtml, formatDate, showNotification } from './utils.js';
import { api } from './api.js';

// Глобальные переменные для редактирования
let currentEditingOrderId = null;
let currentEditingOrderData = null;
let currentAvailableEquipment = [];

// Загрузка заявок
export const loadOrders = async () => {
    $('#ordersContainer').html('<div class="loading">Загрузка...</div>');
    try {
        const res = await api.getOrders();
        if (res.success) {
            displayOrders(res.orders);
        } else {
            $('#ordersContainer').html(`<div class="no-orders">❌ ${res.error}</div>`);
        }
    } catch {
        $('#ordersContainer').html('<div class="no-orders">❌ Ошибка</div>');
    }
};

// Отображение заявок с кнопками редактирования
export const displayOrders = (orders) => {
    if (!orders?.length) {
        $('#ordersContainer').html('<div class="no-orders">Нет заявок</div>');
        return;
    }
    
    let html = '<div class="orders-container">';
    
    orders.forEach(order => {
        const statusClass = order.status === 'completed' ? 'completed' : 
                           (order.status === 'cancelled' ? 'cancelled' : 'active');
        const statusText = order.status_display || 
                          (order.status === 'cancelled' ? 'Отменена' : 
                           (order.status === 'completed' ? 'Завершена' : 'Активна'));
        const startDate = order.date_time_start ? new Date(order.date_time_start).toLocaleString('ru-RU') : 'Не указана';
        const endDate = order.date_time_end ? new Date(order.date_time_end).toLocaleString('ru-RU') : 'Не завершен';
        const isChecked = state.selectedOrders.has(order.id) ? 'checked' : '';
        const commentHtml = order.comment ? `<div class="order-comment">💬 ${escapeHtml(order.comment)}</div>` : '';
        
        html += `
            <div class="order-card" data-id="${order.id}" id="order-${order.id}">
                <div class="order-header">
                    <div class="order-header-content">
                        <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isChecked} onclick="event.stopPropagation()">
                        <div class="order-info" onclick="toggleOrderBody(${order.id})">
                            <h3>📋 Заявка №${order.id} - ${escapeHtml(order.application_name || 'Без названия')}</h3>
                            <div class="order-date">📅 ${startDate} - ${endDate}</div>
                            <span class="order-status ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    <button class="order-toggle" onclick="toggleOrderBody(${order.id})">▼</button>
                </div>
                <div class="order-body" id="order-body-${order.id}">
                    ${commentHtml}
                    <div id="order-items-${order.id}">
                        <div class="loading">Загрузка позиций...</div>
                    </div>
                </div>
            </div>`;
    });
    
    $('#ordersContainer').html(html + '</div>');
    
    // Обработчики чекбоксов
    $('.order-checkbox').on('change', function() {
        const applicationId = parseInt($(this).data('id'));
        if ($(this).is(':checked')) {
            state.selectedOrders.add(applicationId);
            $(`#order-${applicationId}`).addClass('selected');
        } else {
            state.selectedOrders.delete(applicationId);
            $(`#order-${applicationId}`).removeClass('selected');
        }
        updateSelectionInfo();
    });
    
    // Загружаем позиции для каждого заказа
    orders.forEach(order => {
        loadOrderItems(order.id);
    });
    
    updateSelectionInfo();
};

// Функции для работы с заказами (добавить в orders.js)
const openEditOrderModal = async (orderId) => {
    console.log('Открытие редактирования заказа:', orderId);
    currentEditingOrderId = orderId;
    
    showNotification('Загрузка данных заказа...', 'info');
    
    try {
        const response = await api.getOrderDetails(orderId);
        
        if (response.success) {
            currentEditingOrderData = response.order;
            displayEditOrderModal(response.order);
        } else {
            showNotification(response.error || 'Ошибка загрузки заказа', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка загрузки данных заказа', 'error');
    }
};

// Отображение модального окна редактирования (обновленная версия)
const displayEditOrderModal = (order) => {
    const startDate = order.date_time_start ? order.date_time_start.slice(0, 16) : '';
    const endDate = order.date_time_end ? order.date_time_end.slice(0, 16) : '';
    
    let equipmentHtml = '<div class="edit-equipment-list">';
    
    if (order.equipment && order.equipment.length > 0) {
        order.equipment.forEach((eq, index) => {
            const commonBadge = eq.is_common ? '<span class="common-badge-small">🌍 Общее</span>' : '';
            
            equipmentHtml += `
                <div class="edit-equipment-item" data-eq-id="${eq.equipment_id}" data-eq-index="${index}" data-is-common="${eq.is_common}">
                    <div class="edit-equipment-info">
                        <div class="edit-equipment-name">
                            ${escapeHtml(eq.equipment_name)}
                            ${commonBadge}
                        </div>
                        <div class="edit-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="edit-equipment-available">
                            📦 Всего: ${eq.max_quantity || eq.quantity} шт.
                        </div>
                    </div>
                    <div class="edit-equipment-control">
                        <input type="number" 
                               min="0" 
                               max="${eq.max_quantity || eq.quantity}" 
                               value="${eq.quantity}" 
                               class="edit-qty-input" 
                               data-eq-id="${eq.equipment_id}"
                               data-is-common="${eq.is_common}"
                               data-max="${eq.max_quantity || eq.quantity}">
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
        });
    } else {
        equipmentHtml += '<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>';
    }
    
    equipmentHtml += '</div>';
    
    const modalContent = `
        <div class="edit-location-info">
            <p><strong>📍 Локация:</strong> ${escapeHtml(order.location_name)}</p>
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
            <textarea id="editComment" class="edit-comment-input" rows="3" placeholder="Введите комментарий...">${escapeHtml(order.comment || '')}</textarea>
        </div>
        <div class="edit-equipment-header">
            <h4>🔧 Оборудование</h4>
            <button id="addMoreEquipmentBtn" class="add-equipment-btn">➕ Добавить оборудование</button>
        </div>
        ${equipmentHtml}
    `;
    
    $('#editOrderContent').html(modalContent);
    $('#editOrderModal').show();
    
    bindEditModalHandlers();
};

// Привязка обработчиков
const bindEditModalHandlers = () => {
    // Кнопка сохранения
    $('#saveEditBtn').off('click').on('click', () => {
        saveEditedOrder();
    });
    
    // Обработчики изменения количества
    $('.edit-qty-input').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
    });
    
    // Удаление оборудования
    $('.remove-equipment-btn').off('click').click(function() {
        $(this).closest('.edit-equipment-item').remove();
        showNotification('Оборудование удалено', 'info');
        
        if ($('.edit-equipment-item').length === 0) {
            $('.edit-equipment-list').html('<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>');
        }
    });
    
    // Добавление оборудования
    $('#addMoreEquipmentBtn').off('click').click(() => {
        loadAvailableEquipmentForOrder();
    });
};

// Сохранение отредактированного заказа
const saveEditedOrder = async () => {
    if (!currentEditingOrderId) return;
    
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
    
    const equipment = [];
    let hasError = false;
    
    $('.edit-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        const quantity = parseInt($(this).find('.edit-qty-input').val());
        const isCommon = $(this).data('is-common') === true;
        const maxQty = parseInt($(this).find('.edit-qty-input').data('max'));
        
        if (isNaN(quantity)) {
            hasError = true;
            return false;
        }
        
        if (quantity < 0) {
            showNotification('Количество не может быть отрицательным', 'error');
            hasError = true;
            return false;
        }
        
        if (quantity > maxQty) {
            showNotification(`Доступно только ${maxQty} шт.`, 'error');
            hasError = true;
            return false;
        }
        
        if (quantity > 0) {
            equipment.push({
                equipment_id: eqId,
                quantity: quantity,
                is_common: isCommon || false
            });
        }
    });
    
    if (hasError) return;
    
    if (equipment.length === 0) {
        showNotification('Добавьте хотя бы одно оборудование', 'warning');
        return;
    }
    
    const saveBtn = $('#saveEditBtn');
    const originalText = saveBtn.text();
    saveBtn.prop('disabled', true).text('Сохранение...');
    
    try {
        const response = await api.updateOrder(currentEditingOrderId, {
            date_time_start: newDateStart,
            date_time_end: newDateEnd,
            comment: newComment,
            equipment: equipment
        });
        
        if (response.success) {
            showNotification('Заказ успешно обновлен', 'success');
            $('#editOrderModal').hide();
            loadOrders();
        } else {
            showNotification(response.error || 'Ошибка при обновлении', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при сохранении изменений', 'error');
    } finally {
        saveBtn.prop('disabled', false).text(originalText);
    }
};

const cancelOrder = async (orderId) => {
    if (confirm('Вы уверены, что хотите отменить этот заказ?')) {
        try {
            const response = await api.cancelOrder(orderId);
            if (response.success) {
                showNotification('Заказ отменен', 'success');
                loadOrders(); // Перезагружаем список заявок
            } else {
                showNotification(response.error || 'Ошибка при отмене', 'error');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            showNotification('Ошибка при отмене заказа', 'error');
        }
    }
};

const duplicateOrder = async (orderId) => {
    showNotification('Создание копии заказа...', 'info');
    
    try {
        const response = await api.duplicateOrder(orderId);
        if (response.success) {
            showNotification('Копия заказа создана', 'success');
            loadOrders();
        } else {
            showNotification(response.error || 'Ошибка при создании копии', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при создании копии', 'error');
    }
};

// Загрузка доступного оборудования
const loadAvailableEquipmentForOrder = async () => {
    if (!currentEditingOrderData) return;
    
    try {
        const response = await api.getEquipment(currentEditingOrderData.location_id, []);
        
        if (response.success && response.equipment) {
            displayAvailableEquipmentModal(response.equipment);
        } else {
            showNotification('Ошибка загрузки оборудования', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка загрузки оборудования', 'error');
    }
};

// Отображение доступного оборудования
const displayAvailableEquipmentModal = (equipment) => {
    const addedIds = [];
    $('.edit-equipment-item').each(function() {
        addedIds.push(parseInt($(this).data('eq-id')));
    });
    
    let html = '<div class="available-equipment-list">';
    let hasAvailable = false;
    
    equipment.forEach(eq => {
        if (!addedIds.includes(eq.equipment_id)) {
            hasAvailable = true;
            html += `
                <div class="available-equipment-item" data-eq-id="${eq.equipment_id}">
                    <div class="available-equipment-info">
                        <div class="available-equipment-name">${escapeHtml(eq.name)}</div>
                        <div class="available-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="available-equipment-stock">📦 Доступно: ${eq.quantity} шт.</div>
                    </div>
                    <div class="available-equipment-actions">
                        <label>Кол-во:</label>
                        <input type="number" 
                               min="0" 
                               max="${eq.quantity}" 
                               value="1" 
                               class="equipment-select-qty"
                               data-max="${eq.quantity}"
                               data-name="${escapeHtml(eq.name)}"
                               data-eq-id="${eq.equipment_id}"
                               data-type-name="${escapeHtml(eq.type_name)}">
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
    
    $('#confirmAddEquipmentBtn').off('click').one('click', () => {
        addSelectedEquipmentToOrder();
    });
};

// Добавление выбранного оборудования
const addSelectedEquipmentToOrder = () => {
    const selectedItems = [];
    
    $('.available-equipment-item').each(function() {
        const eqId = $(this).data('eq-id');
        const qty = parseInt($(this).find('.equipment-select-qty').val());
        const name = $(this).find('.available-equipment-name').text();
        const typeName = $(this).find('.available-equipment-type').text();
        const maxQty = parseInt($(this).find('.equipment-select-qty').data('max'));
        
        if (qty > 0) {
            selectedItems.push({
                equipment_id: eqId,
                equipment_name: name,
                type_name: typeName,
                quantity: qty,
                max_quantity: maxQty,
                is_common: false
            });
        }
    });
    
    if (!selectedItems.length) {
        showNotification('Выберите оборудование для добавления', 'warning');
        return;
    }
    
    if ($('.edit-equipment-list').text().includes('Нет оборудования')) {
        $('.edit-equipment-list').html('');
    }
    
    selectedItems.forEach(eq => {
        if ($(`.edit-equipment-item[data-eq-id="${eq.equipment_id}"]`).length === 0) {
            const newItemHtml = `
                <div class="edit-equipment-item" data-eq-id="${eq.equipment_id}" data-is-common="false">
                    <div class="edit-equipment-info">
                        <div class="edit-equipment-name">
                            ${escapeHtml(eq.equipment_name)}
                        </div>
                        <div class="edit-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="edit-equipment-available">📦 Всего: ${eq.max_quantity} шт.</div>
                    </div>
                    <div class="edit-equipment-control">
                        <input type="number" 
                               min="0" 
                               max="${eq.max_quantity}" 
                               value="${eq.quantity}" 
                               class="edit-qty-input" 
                               data-eq-id="${eq.equipment_id}"
                               data-max="${eq.max_quantity}">
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить">🗑️</button>
                    </div>
                </div>
            `;
            $('.edit-equipment-list').append(newItemHtml);
        }
    });
    
    // Привязываем обработчики к новым элементам
    $('.edit-qty-input').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
    });
    
    $('.remove-equipment-btn').off('click').click(function() {
        $(this).closest('.edit-equipment-item').remove();
    });
    
    $('#addEquipmentModal').hide();
    showNotification(`Добавлено ${selectedItems.length} позиций`, 'success');
};

// Загрузка позиций заказа
export const loadOrderItems = async (orderId) => {
    try {
        const res = await api.getOrderItems(orderId);
        if (res.success) {
            displayOrderItems(orderId, res.items);
        } else {
            $(`#order-items-${orderId}`).html(`<div class="no-orders">❌ ${res.error}</div>`);
        }
    } catch {
        $(`#order-items-${orderId}`).html('<div class="no-orders">❌ Ошибка</div>');
    }
};

// Получение всех уникальных оборудований из типов
const getAllEquipmentFromTypes = (typesMap) => {
    const equipmentMap = new Map();
    
    for (const [typeName, equipmentList] of typesMap) {
        for (const eq of equipmentList) {
            if (!equipmentMap.has(eq.name)) {
                equipmentMap.set(eq.name, {
                    name: eq.name,
                    quantities: {}
                });
            }
            equipmentMap.get(eq.name).quantities[typeName] = eq.quantity;
        }
    }
    
    // Сортируем оборудование по названию
    return Array.from(equipmentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
};

// Отображение позиций заказа в виде таблицы по типам с кнопками для каждого заказа
export const displayOrderItems = (applicationId, items) => {
    if (!items?.length) {
        $(`#order-items-${applicationId}`).html('<div class="no-orders">Нет позиций в заявке</div>');
        return;
    }
    
    // Группируем по заказам (Order)
    const ordersMap = new Map();
    
    items.forEach(item => {
        const currentOrderId = item.order_id;
        
        if (!ordersMap.has(currentOrderId)) {
            ordersMap.set(currentOrderId, {
                order_id: currentOrderId,
                location_id: item.location_id,
                location_name: item.location_name,
                date_start: item.date_start,
                date_end: item.date_end,
                order_comment: item.order_comment || '',
                typesMap: new Map()
            });
        }
        
        const orderData = ordersMap.get(currentOrderId);
        const typeName = item.type_name;
        
        if (!orderData.typesMap.has(typeName)) {
            orderData.typesMap.set(typeName, []);
        }
        
        const equipmentName = item.is_common ? `🌍 ${item.equipment_name}` : item.equipment_name;
        
        orderData.typesMap.get(typeName).push({
            name: equipmentName,
            quantity: item.quantity,
            is_common: item.is_common || false,
            equipment_id: item.equipment_id,
            type_name: item.type_name
        });
    });
    
    let html = '';
    
    for (const [_, orderData] of ordersMap) {
        const startDate = orderData.date_start ? new Date(orderData.date_start).toLocaleString('ru-RU') : 'Не указана';
        const endDate = orderData.date_end ? new Date(orderData.date_end).toLocaleString('ru-RU') : 'Не завершен';
        
        html += generateLocationCardWithButtons(
            orderData.order_id,
            orderData.location_name,
            startDate,
            endDate,
            orderData.typesMap,
            orderData.order_comment
        );
    }
    
    $(`#order-items-${applicationId}`).html(html);
    
    // Привязываем обработчики кнопок после добавления в DOM
    bindOrderCardButtons();
};

// Генерация карточки локации с кнопками действий
const generateLocationCardWithButtons = (orderId, locationName, startDate, endDate, typesMap, orderComment) => {
    const allTypes = Array.from(typesMap.keys());
    const maxRows = getMaxRows(typesMap);
    
    const commentHtml = orderComment ? `
        <div class="order-comment-inline">
            <span class="comment-label">Комментарий:</span>
            <span class="comment-text">${escapeHtml(orderComment)}</span>
        </div>
    ` : '';
    
    // Кнопки действий для конкретного заказа
    const actionButtons = `
        <div class="order-card-actions">
            <button class="order-edit-btn-small" data-order-id="${orderId}" title="Редактировать заказ">
                ✏️ Редактировать
            </button>
            <button class="order-cancel-btn-small" data-order-id="${orderId}" title="Отменить заказ">
                🚫 Отменить
            </button>
            <button class="order-duplicate-btn-small" data-order-id="${orderId}" title="Создать копию">
                📋 Копировать
            </button>
        </div>
    `;
    
    return `
        <div class="location-order-card" data-order-id="${orderId}">
            <div class="location-order-header">
                <div class="location-order-info">
                    <span class="location-name">📍 ${escapeHtml(locationName)}</span>
                    <span class="location-dates">📅 ${startDate} - ${endDate}</span>
                </div>
                ${actionButtons}
            </div>
            <div class="equipment-matrix">
                <table class="equipment-matrix-table">
                    <thead>
                        <tr>
                            ${allTypes.map(type => `<th class="type-col">${escapeHtml(type)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${generateTableRows(typesMap, allTypes, maxRows)}
                    </tbody>
                </table>
            </div>
            ${commentHtml}
        </div>
    `;
};

// Привязка обработчиков кнопок в карточках заказов
const bindOrderCardButtons = () => {
    // Кнопка "Редактировать"
    $('.order-edit-btn-small').off('click').on('click', function(e) {
        e.stopPropagation();
        const orderId = $(this).data('order-id');
        console.log('Редактирование заказа:', orderId);
        openEditOrderModal(orderId);
    });
    
    // Кнопка "Отменить"
    $('.order-cancel-btn-small').off('click').on('click', function(e) {
        e.stopPropagation();
        const orderId = $(this).data('order-id');
        cancelOrder(orderId);
    });
    
    // Кнопка "Копировать"
    $('.order-duplicate-btn-small').off('click').on('click', function(e) {
        e.stopPropagation();
        const orderId = $(this).data('order-id');
        duplicateOrder(orderId);
    });
};

// Генерация карточки локации
const generateLocationCard = (locationName, startDate, endDate, typesMap, orderComment) => {
    const allTypes = Array.from(typesMap.keys());
    const maxRows = getMaxRows(typesMap);
    
    const commentHtml = orderComment ? `
        <div class="order-comment-inline">
            <span class="comment-label">Комментарий:</span>
            <span class="comment-text">${escapeHtml(orderComment)}</span>
        </div>
    ` : '';
    
    return `
        <div class="location-order-card">
            <div class="location-order-header">
                <span class="location-name">${escapeHtml(locationName)}</span>
                <span class="location-dates">${startDate} - ${endDate}</span>
            </div>
            <div class="equipment-matrix">
                <table class="equipment-matrix-table">
                    <thead>
                        <tr>
                            ${allTypes.map(type => `<th class="type-col">${escapeHtml(type)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${generateTableRows(typesMap, allTypes, maxRows)}
                    </tbody>
                </table>
            </div>
            ${commentHtml}
        </div>
    `;
};

// Генерация карточки общего оборудования
const generateCommonEquipmentCard = (typesMap) => {
    const allTypes = Array.from(typesMap.keys());
    const maxRows = getMaxRows(typesMap);
    
    return `
        <div class="location-order-card common-equipment-card">
            <div class="location-order-header">
                <span class="location-name">🌍 Общее оборудование</span>
                <span class="location-dates">📅 Не привязано к датам</span>
            </div>
            <div class="equipment-matrix">
                <table class="equipment-matrix-table">
                    <thead>
                        <tr>
                            ${allTypes.map(type => `<th class="type-col">${escapeHtml(type)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${generateTableRows(typesMap, allTypes, maxRows)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

// Получение максимального количества строк в любом типе
const getMaxRows = (typesMap) => {
    let maxRows = 0;
    for (const [_, equipmentList] of typesMap) {
        maxRows = Math.max(maxRows, equipmentList.length);
    }
    return maxRows;
};


// Генерация строк таблицы
const generateTableRows = (typesMap, allTypes, maxRows) => {
    let rows = '';
    
    // Преобразуем Map в массив для удобства
    const typesData = [];
    for (const typeName of allTypes) {
        const equipmentList = typesMap.get(typeName) || [];
        // Сортируем оборудование по названию
        equipmentList.sort((a, b) => a.name.localeCompare(b.name));
        typesData.push({
            name: typeName,
            equipment: equipmentList
        });
    }
    
    // Создаем строки для каждой позиции
    for (let i = 0; i < maxRows; i++) {
        let row = '<tr>';
        
        for (let j = 0; j < typesData.length; j++) {
            const equipment = typesData[j].equipment[i];
            if (equipment) {
                row += `
                    <td class="equipment-cell">
                        <div class="equipment-name-with-quantity">
                            <span class="equipment-name">${escapeHtml(equipment.name)}</span>
                            <span class="equipment-quantity-badge">${equipment.quantity} шт.</span>
                        </div>
                    </td>
                `;
            } else {
                row += `<td class="equipment-cell empty">—</td>`;
            }
        }
        
        row += '</tr>';
        rows += row;
    }
    
    return rows;
};

// Получение заголовков колонок по типам
const getTypeColumns = (typesMap) => {
    let columns = '';
    for (const [typeName, _] of typesMap) {
        columns += `<th class="type-col">${escapeHtml(typeName)}</th>`;
    }
    return columns;
};

// Получение строк таблицы с оборудованием
const getEquipmentRows = (typesMap) => {
    // Собираем все уникальное оборудование
    const allEquipment = new Map();
    
    for (const [typeName, equipmentList] of typesMap) {
        for (const eq of equipmentList) {
            if (!allEquipment.has(eq.name)) {
                allEquipment.set(eq.name, {});
            }
            allEquipment.get(eq.name)[typeName] = eq.quantity;
        }
    }
    
    let rows = '';
    for (const [eqName, typeQuantities] of allEquipment) {
        rows += `<tr>`;
        rows += `<td class="equipment-name-cell">${escapeHtml(eqName)}</td>`;
        
        for (const [typeName, _] of typesMap) {
            const quantity = typeQuantities[typeName] || 0;
            if (quantity > 0) {
                rows += `<td class="quantity-cell">${quantity} шт.</td>`;
            } else {
                rows += `<td class="quantity-cell empty">—</td>`;
            }
        }
        
        rows += `</tr>`;
    }
    
    return rows;
};

// Обновление информации о выделении
export const updateSelectionInfo = () => {
    $('.selection-info').remove();
    if (state.selectedOrders.size) {
        $('.button-group').prepend(`<span class="selection-info">✅ Выбрано: ${state.selectedOrders.size}</span>`);
    }
};

// Выделить все заявки
export const selectAllOrders = () => {
    $('.order-checkbox').each(function() {
        if (!$(this).is(':checked')) $(this).trigger('click');
    });
};

// Снять выделение со всех заявок
export const deselectAllOrders = () => {
    $('.order-checkbox').each(function() {
        if ($(this).is(':checked')) $(this).trigger('click');
    });
};

// Переключение видимости заявки
window.toggleOrderBody = (orderId) => {
    const body = $(`#order-body-${orderId}`);
    const toggleBtn = $(`.order-card[data-id="${orderId}"] .order-toggle`);
    
    body.toggleClass('show');
    toggleBtn.html(body.hasClass('show') ? '▲' : '▼');
};

// Экспорт заявок в Excel
export const exportOrdersToExcel = async () => {
    if (!state.selectedOrders.size) {
        showNotification('Выберите заявки для экспорта', 'warning');
        return;
    }
    
    const orderIds = Array.from(state.selectedOrders);
    console.log('Экспорт заявок:', orderIds);
    
    $('#exportOrdersBtn').prop('disabled', true).text('⏳ Экспорт...');
    
    try {
        // Получаем CSRF токен
        const csrftoken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
        
        const response = await fetch('/api/export-orders-to-excel/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'include',
            body: JSON.stringify({ order_ids: orderIds })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ошибка экспорта');
        }
        
        const blob = await response.blob();
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `applications_${new Date().toISOString().slice(0, 19)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showNotification(`Экспортировано ${state.selectedOrders.size} заявок`, 'success');
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        showNotification(`Ошибка: ${error.message}`, 'error');
    } finally {
        $('#exportOrdersBtn').prop('disabled', false).text('Выгрузить в Excel');
    }
};

export const updateOrderStatus = async (orderId, newStatus) => {
    try {
        const csrftoken = getCSRFToken();
        const response = await fetch(`/api/update-order-status/${orderId}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
        });
        const data = await response.json();
        if (data.success) {
            showNotification('Статус заказа обновлен', 'success');
            loadOrders(); // Перезагружаем список
        }
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        showNotification('Ошибка при обновлении статуса', 'error');
    }
};
