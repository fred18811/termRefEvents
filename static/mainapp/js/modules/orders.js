'use strict';

import { state } from './state.js';
import { escapeHtml, formatDate, showNotification } from './utils.js';
import { api } from './api.js';

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

// Отображение заявок
export const displayOrders = (orders) => {
    if (!orders?.length) {
        $('#ordersContainer').html('<div class="no-orders">Нет заявок</div>');
        return;
    }
    
    let html = '<div class="orders-container">';
    
    orders.forEach(order => {
        // Используем статус из БД
        const statusClass = order.status === 'completed' ? 'completed' : 'active';
        const statusText = order.status_display || order.status;
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
                            <h3>Заявка №${order.id} - ${escapeHtml(order.application_name || 'Без названия')}</h3>
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
    
    // Добавляем обработчики для чекбоксов
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

// Отображение позиций заказа в виде таблицы по типам
export const displayOrderItems = (orderId, items) => {
    if (!items?.length) {
        $(`#order-items-${orderId}`).html('<div class="no-orders">Нет позиций в заявке</div>');
        return;
    }
    
    // Группируем по локациям
    const locationsMap = new Map();
    
    items.forEach(item => {
        let locationId = item.location_id;
        let locationName = item.location_name;
        let dateStart = item.date_start;
        let dateEnd = item.date_end;
        let orderComment = item.order_comment || ''; // Комментарий к заказу
        
        if (!locationId) {
            console.warn('Нет location_id для элемента:', item);
            return;
        }
        
        if (!locationsMap.has(locationId)) {
            locationsMap.set(locationId, {
                location_id: locationId,
                location_name: locationName,
                date_start: dateStart,
                date_end: dateEnd,
                order_comment: orderComment, // Добавляем комментарий к заказу
                typesMap: new Map()
            });
        } else {
            // Если комментарий есть у любой позиции, сохраняем его
            const existing = locationsMap.get(locationId);
            if (orderComment && !existing.order_comment) {
                existing.order_comment = orderComment;
            }
        }
        
        const location = locationsMap.get(locationId);
        const typeName = item.type_name;
        
        if (!location.typesMap.has(typeName)) {
            location.typesMap.set(typeName, []);
        }
        
        const equipmentName = item.is_common ? `🌍 ${item.equipment_name}` : item.equipment_name;
        
        location.typesMap.get(typeName).push({
            name: equipmentName,
            quantity: item.quantity,
            is_common: item.is_common || false
        });
    });
    
    let html = '';
    
    for (const [_, location] of locationsMap) {
        const startDate = new Date(location.date_start).toLocaleString('ru-RU');
        const endDate = location.date_end ? new Date(location.date_end).toLocaleString('ru-RU') : 'Не завершен';
        
        html += generateLocationCard(
            location.location_name, 
            startDate, 
            endDate, 
            location.typesMap,
            location.order_comment // Передаем комментарий к заказу
        );
    }
    
    $(`#order-items-${orderId}`).html(html);
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
