'use strict';

import { state } from './state.js';
import { escapeHtml, formatDate, showNotification, debounce  } from './utils.js';
import { api } from './api.js';

// Глобальные переменные для редактирования
let currentEditingOrderId = null;
let currentEditingOrderData = null;
let userPermissions = {
    can_view_all: false,
    can_edit_all: false,
    is_superuser: false
};
let allOrders = [];
let currentFilters = {
    search: '',
    status: 'all',
    user: 'all'
};

// Функция для преобразования UTC даты в локальную для datetime-local input
const formatDateTimeForInput = (isoString) => {
    if (!isoString) return '';
    
    try {
        // Создаем дату из ISO строки
        const date = new Date(isoString);
        
        // Проверяем, что дата валидна
        if (isNaN(date.getTime())) return '';
        
        // Получаем локальные компоненты даты и времени
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
        console.error('Ошибка форматирования даты:', error);
        return '';
    }
};

// Загрузка заявок
export const loadOrders = async () => {
    $('#ordersContainer').html('<div class="loading">Загрузка...</div>');
    try {
        const res = await api.getOrders();
        if (res.success) {
            if (res.user_permissions) {
                userPermissions = res.user_permissions;
            }
            allOrders = res.orders;
            applyFiltersAndDisplay();
            initOrderFilters();
        } else {
            $('#ordersContainer').html(`<div class="no-orders">❌ ${res.error}</div>`);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        $('#ordersContainer').html('<div class="no-orders">❌ Ошибка загрузки</div>');
    }
};

// Применение фильтров и отображение
const applyFiltersAndDisplay = () => {
    let filteredOrders = [...allOrders];
    
    // Фильтр по поисковому запросу (название заявки)
    if (currentFilters.search) {
        const searchLower = currentFilters.search.toLowerCase();
        filteredOrders = filteredOrders.filter(order => 
            order.application_name && order.application_name.toLowerCase().includes(searchLower)
        );
    }
    
    // Фильтр по статусу
    if (currentFilters.status !== 'all') {
        filteredOrders = filteredOrders.filter(order => order.status === currentFilters.status);
    }
    
    // Фильтр по пользователю (только для тех, у кого есть права)
    if (currentFilters.user !== 'all' && (userPermissions.can_view_all || userPermissions.is_superuser)) {
        filteredOrders = filteredOrders.filter(order => order.user_name === currentFilters.user);
    }
    
    // Обновляем счетчик результатов
    updateSearchResultCount(filteredOrders.length, allOrders.length);
    
    displayOrders(filteredOrders);
};

// Обновление счетчика результатов поиска
const updateSearchResultCount = (found, total) => {
    const existingCount = $('#searchResultCount');
    if (found !== total) {
        if (existingCount.length) {
            existingCount.text(`Найдено: ${found} из ${total}`);
        } else {
            $('.filter-group').prepend(`<span id="searchResultCount" class="search-result-count">Найдено: ${found} из ${total}</span>`);
        }
    } else {
        existingCount.remove();
    }
};

// Обработчик поиска с debounce
const handleOrderSearch = debounce((query) => {
    currentFilters.search = query;
    applyFiltersAndDisplay();
}, 300);

// Очистка всех фильтров
export const clearAllFilters = () => {
    currentFilters = {
        search: '',
        status: 'all',
        user: 'all'
    };
    $('#orderSearchInput').val('');
    $('#orderStatusFilter').val('all');
    $('#orderUserFilter').val('all');
    applyFiltersAndDisplay();
    showNotification('Фильтры очищены', 'info');
};

// Инициализация фильтров в DOM
export const initOrderFilters = () => {
    // Создаем панель фильтров, если её нет
    if (!$('#orderFiltersPanel').length) {
        const filterPanel = `
            <div id="orderFiltersPanel" class="order-filters-panel">
                <div class="filter-row">
                    <div class="filter-group-search">
                        <input type="text" id="orderSearchInput" class="search-input" placeholder="🔍 Поиск по названию заявки...">
                        <button id="clearFiltersBtn" class="btn-clear-filters" title="Очистить все фильтры">✖ Очистить</button>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="filter-item">
                        <label>📊 Статус:</label>
                        <select id="orderStatusFilter" class="sort-select">
                            <option value="all">Все статусы</option>
                            <option value="new">🟢 Новые</option>
                            <option value="in_progress">🟡 В работе</option>
                            <option value="completed">⚪ Завершенные</option>
                            <option value="cancelled">🔴 Отмененные</option>
                        </select>
                    </div>
                    <div id="userFilterContainer" class="filter-item" style="${(userPermissions.can_view_all || userPermissions.is_superuser) ? '' : 'display: none;'}">
                        <label>👤 Пользователь:</label>
                        <select id="orderUserFilter" class="sort-select">
                            <option value="all">Все пользователи</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
        $('.page-header').after(filterPanel);
        
        // Заполняем список пользователей
        if (userPermissions.can_view_all || userPermissions.is_superuser) {
            populateUserFilter();
        }
    }
    
    // Привязываем обработчики
    $('#orderSearchInput').off('input').on('input', function() {
        handleOrderSearch($(this).val());
    });
    
    $('#orderStatusFilter').off('change').on('change', function() {
        currentFilters.status = $(this).val();
        applyFiltersAndDisplay();
    });
    
    $('#orderUserFilter').off('change').on('change', function() {
        currentFilters.user = $(this).val();
        applyFiltersAndDisplay();
    });
    
    $('#clearFiltersBtn').off('click').on('click', function() {
        clearAllFilters();
    });
};

// Заполнение списка пользователей
const populateUserFilter = () => {
    const users = new Set();
    allOrders.forEach(order => {
        if (order.user_name) {
            users.add(order.user_name);
        }
    });
    
    const userSelect = $('#orderUserFilter');
    const currentValue = userSelect.val();
    
    userSelect.empty();
    userSelect.append('<option value="all">👥 Все пользователи</option>');
    
    Array.from(users).sort().forEach(user => {
        userSelect.append(`<option value="${escapeHtml(user)}">👤 ${escapeHtml(user)}</option>`);
    });
    
    if (currentValue && currentValue !== 'all') {
        userSelect.val(currentValue);
    }
};

// Обновленная функция displayOrders (с учетом фильтров)
export const displayOrders = (orders) => {
    if (!orders?.length) {
        $('#ordersContainer').html('<div class="no-orders">🔍 Нет заявок, соответствующих фильтрам</div>');
        return;
    }
    
    let html = '<div class="orders-container">';
    
    orders.forEach(order => {
        const statusClass = order.status === 'completed' ? 'completed' : 
                           (order.status === 'cancelled' ? 'cancelled' : 'active');
        const statusText = order.status_display || 
                          (order.status === 'cancelled' ? 'Отменена' : 
                           (order.status === 'completed' ? 'Завершена' : 'Активна'));
        
        let statusIcon = '';
        switch(order.status) {
            case 'new': statusIcon = '🟢'; break;
            case 'in_progress': statusIcon = '🟡'; break;
            case 'completed': statusIcon = '⚪'; break;
            case 'cancelled': statusIcon = '🔴'; break;
            default: statusIcon = '📋';
        }
        
        // ОТОБРАЖАЕМ ДАТЫ ИЗ APPLICATION (date_time_start, date_time_end)
        // Эти поля теперь содержат даты из Application
        const startDate = order.date_time_start ? new Date(order.date_time_start).toLocaleString('ru-RU') : 'Не указана';
        const endDate = order.date_time_end ? new Date(order.date_time_end).toLocaleString('ru-RU') : 'Не завершен';
        
        const isChecked = state.selectedOrders.has(order.id) ? 'checked' : '';
        const commentHtml = order.comment ? `<div class="order-comment">💬 ${escapeHtml(order.comment)}</div>` : '';
        
        const canEdit = order.can_edit === true;
        const ownerInfo = (userPermissions.can_view_all || userPermissions.is_superuser) && order.user_name ? 
            `<span class="order-owner">👤 ${escapeHtml(order.user_name)}</span>` : '';
        
        let displayName = escapeHtml(order.application_name || 'Без названия');
        if (currentFilters.search) {
            const regex = new RegExp(`(${escapeRegex(currentFilters.search)})`, 'gi');
            displayName = displayName.replace(regex, '<span class="highlight">$1</span>');
        }
        
        html += `
            <div class="order-card" data-id="${order.id}" id="order-${order.id}">
                <div class="order-header">
                    <div class="order-header-content">
                        <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isChecked} onclick="event.stopPropagation()">
                        <div class="order-info" onclick="toggleOrderBody(${order.id})">
                            <h3>📋 Заявка №${order.id} - ${displayName}</h3>
                            <div class="order-date">📅 ${startDate} - ${endDate}</div>
                            <span class="order-status ${statusClass}">${statusIcon} ${statusText}</span>
                            ${ownerInfo}
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
    
    orders.forEach(order => {
        loadOrderItems(order.id);
    });
    
    updateSelectionInfo();
};

// Экранирование для регулярного выражения
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// Отображение модального окна редактирования (исправленная версия)
const displayEditOrderModal = (order) => {
    // Правильное преобразование дат из UTC в локальное время
    const startDate = formatDateTimeForInput(order.date_time_start);
    const endDate = formatDateTimeForInput(order.date_time_end);
    
    console.log('Исходные даты из API:', {
        date_time_start: order.date_time_start,
        date_time_end: order.date_time_end
    });
    console.log('Преобразованные даты для input:', {
        startDate: startDate,
        endDate: endDate
    });
    
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

// Обновленная функция loadOrderItems (добавлена передача can_edit)
export const loadOrderItems = async (orderId) => {
    try {
        const res = await api.getOrderItems(orderId);
        if (res.success) {
            displayOrderItems(orderId, res.items, res.can_edit || false);
        } else {
            $(`#order-items-${orderId}`).html(`<div class="no-orders">❌ ${escapeHtml(res.error)}</div>`);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        $(`#order-items-${orderId}`).html('<div class="no-orders">❌ Ошибка загрузки позиций</div>');
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

// Функция для загрузки всех сохраненных значений
const loadAllApprovalValues = () => {
    $('.approval-quantity-input').each(function() {
        const $input = $(this);
        const orderId = $input.data('order-id');
        const locationId = $input.data('location-id');
        const equipmentId = $input.data('equipment-id');
        
        const storageKey = `order_${orderId}_${locationId}`;
        const savedValues = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const savedValue = savedValues[equipmentId];
        
        if (savedValue) {
            $input.val(savedValue.quantity);
            const $checkbox = $(`.approval-checkbox[data-order-id="${orderId}"][data-location-id="${locationId}"][data-equipment-id="${equipmentId}"]`);
            
            if (savedValue.quantity > 0) {
                $checkbox.prop('disabled', false);
            }
            
            if (savedValue.isChecked) {
                $checkbox.prop('checked', true);
                // Блокируем поле ввода, если галочка была установлена
                $input.prop('readonly', true);
                $input.css('background-color', '#f0f0f0');
            } else {
                $input.prop('readonly', false);
                $input.css('background-color', 'white');
            }
        }
    });
};

// Функция для загрузки сохраненных значений согласования из items
const loadApprovalValuesFromItems = () => {
    $('.approval-quantity-input').each(function() {
        const $input = $(this);
        const orderId = $input.data('order-id');
        const locationId = $input.data('location-id');
        const equipmentId = $input.data('equipment-id');
        const orderItemId = $input.data('order-item-id');
        
        // Ищем соответствующий item по order_item_id
        // Данные уже переданы в items, нужно только отобразить
        console.log(`Загрузка для order_item_id: ${orderItemId}`);
    });
};

// Отображение позиций заказа с кнопками
export const displayOrderItems = async (applicationId, items, canEdit = false) => {
    if (!items?.length) {
        $(`#order-items-${applicationId}`).html('<div class="no-orders">Нет позиций в заявке</div>');
        return;
    }
    
    // Загружаем подразделения пользователя и типы оборудования
    const { userDepartments, departmentTypes, canEditApproval } = await loadUserDepartmentAndTypes();
    
    console.log('Полученные items из API:', items);
    
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
        
        // Сохраняем данные из БД (can_provide, is_agreed)
        orderData.typesMap.get(typeName).push({
            name: equipmentName,
            quantity: item.quantity,
            is_common: item.is_common || false,
            equipment_id: item.equipment_id,
            type_name: item.type_name,
            order_item_id: item.id,
            can_provide: item.can_provide || 0,      // ДОБАВИТЬ
            is_agreed: item.is_agreed || false       // ДОБАВИТЬ
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
            orderData.order_comment,
            canEdit,
            userDepartments,
            departmentTypes,
            canEditApproval
        );
    }
    
    $(`#order-items-${applicationId}`).html(html);
    
    // Загружаем сохраненные значения из БД в интерфейс
    loadApprovalValuesFromItems();
    
    // Привязываем обработчики для полей согласования только если есть права
    if (canEditApproval) {
        bindApprovalControls();
    }
    
    if (canEdit) {
        bindOrderCardButtons();
    }
};

// Функция для загрузки сохраненных значений согласования с сервера
const loadApprovalValuesFromServer = async () => {
    // Значения уже пришли в items, нужно только отобразить их в интерфейсе
    $('.approval-quantity-input').each(function() {
        const $input = $(this);
        const orderId = $input.data('order-id');
        const locationId = $input.data('location-id');
        const equipmentId = $input.data('equipment-id');
        
        // Ищем соответствующий order_item_id в данных
        const orderItemId = $input.data('order-item-id');
        
        if (orderItemId) {
            // Здесь можно загрузить данные с сервера, но они уже есть в items
            // Просто отображаем сохраненные значения
        }
    });
};

// Генерация карточки с кнопками (только если есть права)
const generateLocationCardWithButtons = (orderId, locationName, startDate, endDate, typesMap, orderComment, canEdit, userDepartments, departmentTypes, canEditApproval) => {
    const allTypes = Array.from(typesMap.keys());
    const maxRows = getMaxRows(typesMap);
    
    const commentHtml = orderComment ? `
        <div class="order-comment-inline">
            <span class="comment-label">Комментарий:</span>
            <span class="comment-text">${escapeHtml(orderComment)}</span>
        </div>
    ` : '';
    
    // Кнопки действий только если есть права на редактирование
    const actionButtons = canEdit ? `
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
    ` : '';
    
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
                        ${generateTableRows(typesMap, allTypes, maxRows, orderId, locationName, userDepartments, departmentTypes, canEditApproval)}
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


// Генерация строк таблицы с input и checkbox
const generateTableRows = (typesMap, allTypes, maxRows, orderId, locationId, userDepartments, departmentTypes, canEditApproval) => {
    let rows = '';
    
    const typesData = [];
    for (const typeName of allTypes) {
        const equipmentList = typesMap.get(typeName) || [];
        equipmentList.sort((a, b) => a.name.localeCompare(b.name));
        
        const canProvide = departmentTypes.some(dt => dt.name === typeName);
        
        typesData.push({
            name: typeName,
            equipment: equipmentList,
            can_provide: canProvide
        });
    }
    
    for (let i = 0; i < maxRows; i++) {
        let row = '<tr>';
        
        for (let j = 0; j < typesData.length; j++) {
            const typeData = typesData[j];
            const equipment = typeData.equipment[i];
            
            if (equipment) {
                const equipmentId = equipment.equipment_id || `eq_${i}_${j}`;
                // Используем данные из БД (can_provide, is_agreed)
                const savedQuantity = equipment.can_provide || 0;
                const savedIsChecked = equipment.is_agreed || false;
                const canProvide = typeData.can_provide && canEditApproval;
                
                row += `
                    <td class="equipment-cell">
                        <div class="equipment-name-with-quantity">
                            <span class="equipment-name">${escapeHtml(equipment.name)}</span>
                            <span class="equipment-quantity-badge">${equipment.quantity} шт.</span>
                        </div>
                        ${canProvide ? `
                        <div class="equipment-approval-controls">
                            <input type="number" 
                                   class="approval-quantity-input" 
                                   data-order-id="${orderId}"
                                   data-location-id="${locationId}"
                                   data-equipment-id="${equipmentId}"
                                   data-order-item-id="${equipment.order_item_id || ''}"
                                   data-type-name="${escapeHtml(typeData.name)}"
                                   data-max="${equipment.quantity}"
                                   value="${savedQuantity}"
                                   placeholder="0"
                                   min="0"
                                   max="${equipment.quantity}"
                                   ${savedIsChecked ? 'readonly' : ''}
                                   style="width: 70px; padding: 0.3rem; text-align: center; border-radius: 4px; border: 1px solid #ddd; ${savedIsChecked ? 'background-color: #f0f0f0;' : ''}">
                            <label class="approval-checkbox-label">
                                <input type="checkbox" 
                                       class="approval-checkbox" 
                                       data-order-id="${orderId}"
                                       data-location-id="${locationId}"
                                       data-equipment-id="${equipmentId}"
                                       data-order-item-id="${equipment.order_item_id || ''}"
                                       ${savedIsChecked ? 'checked' : ''}
                                       ${savedQuantity > 0 && !savedIsChecked ? '' : 'disabled'}>
                                <span style="font-size: 0.7rem;">Согласовано</span>
                            </label>
                        </div>
                        ` : `
                        <div class="equipment-status" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #e2e8f0; text-align: right;">
                            <span style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 12px; background-color: ${savedIsChecked ? '#28a745' : '#ffc107'}; color: ${savedIsChecked ? 'white' : '#333'};">
                                ${savedIsChecked ? '✅ Согласовано' : '⏳На согласовании'}
                                ${savedQuantity ? ` (${savedQuantity} шт.)` : ''}
                            </span>
                        </div>
                        `}
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

// Функция для сохранения значений в localStorage
const saveApprovalValue = (orderId, locationId, equipmentId, quantity, isChecked) => {
    const storageKey = `order_${orderId}_${locationId}`;
    const savedValues = JSON.parse(localStorage.getItem(storageKey) || '{}');
    savedValues[equipmentId] = { quantity: quantity, isChecked: isChecked };
    localStorage.setItem(storageKey, JSON.stringify(savedValues));
};

// Функция сохранения согласования на сервер
const saveApprovalToServer = async (orderItemId, canProvide, isAgreed) => {
    if (!orderItemId) {
        console.warn('Нет order_item_id для сохранения');
        return;
    }
    
    try {
        const response = await api.updateOrderItemApproval(orderItemId, canProvide, isAgreed);
        if (response.success) {
            console.log(`Сохранено согласование для позиции ${orderItemId}: количество=${canProvide}, согласовано=${isAgreed}`);
            // Обновляем локальные данные
            const $input = $(`.approval-quantity-input[data-order-item-id="${orderItemId}"]`);
            const $checkbox = $(`.approval-checkbox[data-order-item-id="${orderItemId}"]`);
            
            if ($input.length) {
                $input.data('saved-quantity', canProvide);
                $input.val(canProvide);
            }
            if ($checkbox.length) {
                $checkbox.data('saved-checked', isAgreed);
                if (isAgreed) {
                    $checkbox.prop('checked', true);
                    $checkbox.prop('disabled', true);
                    $input.prop('readonly', true);
                    $input.css('background-color', '#f0f0f0');
                }
            }
        } else {
            console.error('Ошибка сохранения:', response.error);
            showNotification(`Ошибка: ${response.error}`, 'error');
        }
    } catch (error) {
        console.error('Ошибка при сохранении согласования:', error);
        showNotification('Ошибка при сохранении данных', 'error');
    }
};

// Привязка обработчиков для полей ввода и чекбоксов
const bindApprovalControls = () => {
    // Обработчик изменения количества
    $('.approval-quantity-input').off('input').on('input', function() {
        const $input = $(this);
        const quantity = parseInt($input.val()) || 0;
        const maxQuantity = parseInt($input.data('max')) || 0;
        const orderId = $input.data('order-id');
        const locationId = $input.data('location-id');
        const equipmentId = $input.data('equipment-id');
        const orderItemId = $input.data('order-item-id');
        
        let finalQuantity = quantity;
        if (quantity > maxQuantity) finalQuantity = maxQuantity;
        if (quantity < 0) finalQuantity = 0;
        $input.val(finalQuantity);
        
        const $checkbox = $(`.approval-checkbox[data-order-id="${orderId}"][data-location-id="${locationId}"][data-equipment-id="${equipmentId}"]`);
        
        if (finalQuantity > 0) {
            $checkbox.prop('disabled', false);
        } else {
            $checkbox.prop('disabled', true);
            $checkbox.prop('checked', false);
            $input.prop('readonly', false);
            $input.css('background-color', 'white');
            // Сохраняем на сервер
            saveApprovalToServer(orderItemId, finalQuantity, false);
            saveApprovalValue(orderId, locationId, equipmentId, finalQuantity, false);
        }
        
        const isChecked = $checkbox.is(':checked');
        saveApprovalValue(orderId, locationId, equipmentId, finalQuantity, isChecked);
        // Сохраняем на сервер при изменении количества
        if (orderItemId) {
            saveApprovalToServer(orderItemId, finalQuantity, isChecked);
        }
    });
    
    // Обработчик изменения чекбокса
    $('.approval-checkbox').off('change').on('change', function() {
        const $checkbox = $(this);
        const isChecked = $checkbox.is(':checked');
        const orderId = $checkbox.data('order-id');
        const locationId = $checkbox.data('location-id');
        const equipmentId = $checkbox.data('equipment-id');
        const orderItemId = $checkbox.data('order-item-id');
        
        const $input = $(`.approval-quantity-input[data-order-id="${orderId}"][data-location-id="${locationId}"][data-equipment-id="${equipmentId}"]`);
        const quantity = parseInt($input.val()) || 0;
        
        if (isChecked) {
            $input.prop('readonly', true);
            $input.css('background-color', '#f0f0f0');
            const typeName = $input.data('type-name');
            showNotification(`${typeName}: согласовано ${quantity} шт.`, 'success');
            // Сохраняем на сервер
            if (orderItemId) {
                saveApprovalToServer(orderItemId, quantity, true);
            }
        } else {
            $checkbox.prop('checked', true);
            showNotification('Нельзя отменить согласование. Обратитесь к администратору.', 'warning');
            return;
        }
        
        saveApprovalValue(orderId, locationId, equipmentId, quantity, isChecked);
    });
};


// Функция для загрузки подразделений пользователя и типов оборудования
const loadUserDepartmentAndTypes = async () => {
    try {
        const [departmentsRes, departmentTypesRes] = await Promise.all([
            fetch('/api/user/departments/').then(res => res.json()),
            fetch('/api/user/department-types/').then(res => res.json())
        ]);
        
        let userDepartments = [];
        let departmentTypes = [];
        let canEditApproval = false;
        
        if (departmentsRes.success && departmentsRes.departments) {
            userDepartments = departmentsRes.departments;
            // Если пользователь состоит хотя бы в одном подразделении, может редактировать согласование
            canEditApproval = userDepartments.length > 0;
        }
        
        if (departmentTypesRes.success && departmentTypesRes.department_types) {
            departmentTypes = departmentTypesRes.department_types;
            console.log('Загружены типы оборудования для подразделений:', departmentTypes);
        }
        
        console.log('Пользователь состоит в подразделениях:', userDepartments.length > 0);
        console.log('Может редактировать согласование:', canEditApproval);
        
        return { userDepartments, departmentTypes, canEditApproval };
    } catch (error) {
        console.error('Ошибка загрузки данных подразделений:', error);
        return { userDepartments: [], departmentTypes: [], canEditApproval: false };
    }
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
