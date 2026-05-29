'use strict';

import { state } from './state.js';
import { escapeHtml, formatDate, showNotification, debounce, formatDateTimeForDisplay, convertToServerDateFormat   } from './utils.js';
import { api } from './api.js';
import { showConfirm } from './modal.js';

// Глобальные переменные для редактирования
let currentEditingOrderId = null;
let currentEditingOrderData = null;
let userPermissions = {
    can_view_all: false,
    can_edit_all: false,
    is_superuser: false
};
let userDepartments = [];
let allOrders = [];
let currentFilters = {
    search: '',
    status: 'all',
    user: 'all'
};

// ========== ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТУСА ПОДРАЗДЕЛЕНИЯ ==========
const updateDepartmentButton = (applicationId, departmentName) => {
    console.log('updateDepartmentButton вызван для заявки:', applicationId, 'подразделения:', departmentName);

    //Находим заказ
    const $orderCard = $(`.order-card[data-id="${applicationId}"]`);

    // Находим все чекбоксы в этой заявке (data-order-id у чекбокса = ID заявки)
    const $allCheckboxes = $orderCard.find(`.approval-checkbox`)
    
    let totalItems = $allCheckboxes.length;
    let agreedItems = $allCheckboxes.filter(':checked').length;
    
    console.log(`Всего позиций: ${totalItems}, согласовано: ${agreedItems}`);
    
    const allAgreed = totalItems > 0 && agreedItems === totalItems;
    
    // Находим блок approval-item для этой заявки (по applicationId)
    const $approvalItem = $(`.approval-item[data-application-id="${applicationId}"][data-approval-dept="${departmentName}"]`);
    
    if (!$approvalItem.length) {
        console.log('Approval item не найден для заявки:', applicationId);
        return;
    }
    
    console.log('Найден approval-item, обновляем...');
    
    const $statusArea = $approvalItem.find('.approval-status-area');
    const $equipmentInfo = $approvalItem.find('.equipment-info');
    
    // Обновляем информацию о количестве
    if ($equipmentInfo.length && totalItems > 0) {
        $equipmentInfo.html(` (${agreedItems}/${totalItems} позиций согласовано)`);
    }
    
    if (allAgreed) {
        console.log('Всё оборудование согласовано, показываем кнопку');
        $statusArea.html(`
            <button class="btn-approve-application" 
                    data-application-id="${applicationId}" 
                    data-department-name="${escapeHtml(departmentName)}" 
                    data-department-id="${$approvalItem.data('department-id')}">
                ✅ Согласовать
            </button>
        `);
        
        $statusArea.find('.btn-approve-application').off('click').on('click', function(e) {
            e.stopPropagation();
            const appId = $(this).data('application-id');
            const deptName = $(this).data('department-name');
            const deptId = $(this).data('department-id');
            
            showConfirm(
                `Вы уверены, что хотите согласовать заявку №${appId} от подразделения "${deptName}"?`,
                async () => {
                    await approveApplication(appId, deptId);
                }
            );
        });
    } else if (totalItems > 0) {
        console.log('Не всё оборудование согласовано, показываем заглушку');
        $statusArea.html(`
            <span class="approve-disabled-hint" title="Не всё оборудование подразделения согласовано">
                <i class="fa fa-lock" aria-hidden="true"></i> Требуется согласование всего оборудования (${agreedItems}/${totalItems})
            </span>
        `);
    }
};

const getCSRFToken = () => {
    return document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
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

// Загрузка подразделений текущего пользователя
const loadUserDepartments = async () => {
    try {
        const response = await fetch('/api/user/departments/');
        const data = await response.json();
        
        if (data.success && data.departments) {
            userDepartments = data.departments;
            console.log('Загружены подразделения пользователя:', userDepartments);
        }
    } catch (error) {
        console.error('Ошибка загрузки подразделений:', error);
        userDepartments = [];
    }
};

// Загрузка заявок
export const loadOrders = async () => {
    $('#ordersContainer').html('<div class="loading">Загрузка...</div>');
    try {
        await loadUserDepartments();
        
        const res = await api.getOrders();
        if (res.success) {
            if (res.user_permissions) {
                userPermissions = res.user_permissions;
            }
            allOrders = res.orders;
            
            // Отладка: выводим статусы всех заявок
            console.log('Загружены заявки:');
            allOrders.forEach(order => {
                console.log(`  Заявка №${order.id}: статус = ${order.status} (${order.status_display})`);
            });

            for (const order of allOrders) {
                try {
                    const itemsRes = await api.getOrderItems(order.id);
                    if (itemsRes.success && itemsRes.items) {
                        const locations = new Set();
                        itemsRes.items.forEach(item => {
                            if (item.location_name) {
                                locations.add(item.location_name);
                            }
                        });
                        order.locations = Array.from(locations);
                    }
                } catch (error) {
                    console.error(`Ошибка загрузки локаций для заявки ${order.id}:`, error);
                    order.locations = [];
                }
            }
            
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
                        <input type="text" id="orderSearchInput" class="search-input" placeholder="Поиск по названию заявки...">
                        <button id="clearFiltersBtn" class="btn-clear-filters" title="Очистить все фильтры">✖ Очистить</button>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="filter-item">
                        <label><i class="fa fa-rocket" aria-hidden="true"></i> Статус:</label>
                        <select id="orderStatusFilter" class="sort-select">
                            <option value="all">Все статусы</option>
                            <option value="new">🟢 Новые</option>
                            <option value="in_progress">🟡 В работе</option>
                            <option value="completed">⚪ Завершенные</option>
                            <option value="cancelled">🔴 Отмененные</option>
                        </select>
                    </div>
                    <div id="userFilterContainer" class="filter-item" style="${(userPermissions.can_view_all || userPermissions.is_superuser) ? '' : 'display: none;'}">
                        <label><i class="fa fa-user" aria-hidden="true"></i> Пользователь:</label>
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
        userSelect.append(`<option value="${escapeHtml(user)}"><i class="fa fa-user" aria-hidden="true"></i> ${escapeHtml(user)}</option>`);
    });
    
    if (currentValue && currentValue !== 'all') {
        userSelect.val(currentValue);
    }
};

// Функция согласования заявки
const approveApplication = async (applicationId, departmentId) => {
    showNotification('Отправка запроса на согласование...', 'info');
    
    try {
        const csrftoken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
        
        const response = await fetch('/api/application/approve/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            credentials: 'include',
            body: JSON.stringify({
                application_id: applicationId,
                department_id: departmentId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`✅ Заявка №${applicationId} согласована!`, 'success');
            
            // Если все подразделения согласовали, показываем дополнительное уведомление
            if (data.all_approved) {
                showNotification(`🎉 Заявка №${applicationId} переведена в статус "В работе"!`, 'success');
            }
            
            // Обновляем список заявок
            loadOrders();
        } else {
            showNotification(data.error || 'Ошибка при согласовании', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка при отправке запроса', 'error');
    }
};

// Обновленная функция displayOrders (с учетом фильтров)
export const displayOrders = (orders) => {
    if (!orders?.length) {
        $('#ordersContainer').html('<div class="no-orders"><i class="fa fa-search" aria-hidden="true"></i> Нет заявок, соответствующих фильтрам</div>');
        return;
    }
    
    let html = '<div class="orders-container">';
    
    orders.forEach(order => {
        console.log(order.status)
        const statusClass = order.status === 'completed' ? 'completed' : 
                           (order.status === 'cancelled' ? 'cancelled' : 
                            (order.status === 'in_progress' ? 'in_progress':'active'));
        const statusText = order.status_display || 
                          (order.status === 'cancelled' ? 'Отменена' : 
                           (order.status === 'completed' ? 'Завершена' : 'Активна'));

        const colorStatus = order.status === 'completed' ? '#cbd5e152' : 
                           (order.status === 'cancelled' ? '#cbd5e152' : 
                            (order.status === 'in_progress' ? '#e1d7cb45':'#d5e1cb4a'));
        
        let statusIcon = '';
        switch(order.status) {
            case 'new': statusIcon = ''; break;
            case 'in_progress': statusIcon = ''; break;
            case 'completed': statusIcon = ''; break;
            case 'cancelled': statusIcon = ''; break;
            default: statusIcon = '<i class="fa fa-file-text-o" aria-hidden="true"></i>';
        }
        
        // Проверка, истекла ли заявка по времени (используем orderEndDate вместо endDate)
        const now = new Date();
        const orderEndDate = order.date_time_end ? new Date(order.date_time_end) : null;
        const isExpired = orderEndDate && orderEndDate < now && order.status !== 'completed' && order.status !== 'cancelled';
        
        // Проверка, можно ли оставить отзыв (заявка истекла и не завершена/не отменена)
        const canLeaveFeedback = isExpired && order.status !== 'completed' && order.status !== 'cancelled';
        
        const startDate = order.date_time_start ? new Date(order.date_time_start).toLocaleString('ru-RU') : 'Не указана';
        const endDateStr = order.date_time_end ? new Date(order.date_time_end).toLocaleString('ru-RU') : 'Не завершен';
        
        const isChecked = state.selectedOrders.has(order.id) ? 'checked' : '';
        const commentHtml = order.comment ? `<div class="order-comment"><i class="fa fa-comment-o" aria-hidden="true"></i> ${escapeHtml(order.comment)}</div>` : '';
        
        const canEdit = order.can_edit === true;
        const ownerInfo = (userPermissions.can_view_all || userPermissions.is_superuser) && order.user_name ? 
            `<span class="order-owner"><i class="fa fa-user" aria-hidden="true"></i> ${escapeHtml(order.user_name)}</span>` : '';
        
        let displayName = escapeHtml(order.application_name || 'Без названия');
        if (currentFilters.search) {
            const regex = new RegExp(`(${escapeRegex(currentFilters.search)})`, 'gi');
            displayName = displayName.replace(regex, '<span class="highlight">$1</span>');
        }
        
        // Кнопка обратной связи
        const feedbackButton = canLeaveFeedback ? 
            `<button class="order-feedback-btn" data-application-id="${order.id}" data-application-name="${escapeHtml(order.application_name)}"><i class="fa fa-file-text-o" aria-hidden="true"></i> Оставить отзыв</button>` : '';
        
        // Генерируем блок согласований
        let approvalsHtml = '';
        if (order.approvals && order.approvals.length > 0) {
            approvalsHtml = '<div class="order-approvals">';
            approvalsHtml += '<div class="approvals-title"><i class="fa fa-file-text-o" aria-hidden="true"></i> Согласование подразделений:</div>';
            approvalsHtml += '<div class="approvals-list">';
            
            order.approvals.forEach(approval => {
                const statusColor = approval.is_agreed ? '#28a745' : '#ffc107';
                const statusBgColor = approval.is_agreed ? '#d4edda' : '#fffbee';
                const statusIconApproval = approval.is_agreed ? '<i class="fa fa-check" aria-hidden="true"></i>' : '<i class="fa fa-hourglass-half" aria-hidden="true"></i>';
                
                // Проверяем, может ли пользователь согласовать
                const userInDepartment = userDepartments.some(d => d.name === approval.department_name);
                // Кнопка активна ТОЛЬКО если:
                // 1. Ещё не согласовано
                // 2. Пользователь из этого подразделения
                // 3. ВСЁ оборудование подразделения согласовано (all_equipment_agreed = true)
                const canApprove = !approval.is_agreed && userInDepartment && approval.all_equipment_agreed;
                
                // Информация о согласованном оборудовании
                const equipmentInfo = approval.total_items ? 
                    `<span class="equipment-info"> (${approval.agreed_items}/${approval.total_items} позиций согласовано)</span>` : '';
                
                approvalsHtml += `
                    <div class="approval-item ${approval.status_class}" data-approval-dept="${approval.department_name}" data-application-id="${order.id}" data-department-id="${approval.department_id}" style="border-left-color: ${statusColor}; background-color: ${statusBgColor};">
                        <div class="approval-department-info">
                            <span class="approval-department"><i class="fa fa-building-o" aria-hidden="true"></i> ${escapeHtml(approval.department_name)}</span>
                            ${equipmentInfo}
                        </div>
                        <div class="approval-status-area">
                            <span class="approval-status" style="color: ${statusColor};">
                                ${statusIconApproval} ${escapeHtml(approval.status_text)}
                            </span>
                            ${canApprove ? 
                                `<button class="btn-approve-application" data-application-id="${order.id}" data-department-name="${escapeHtml(approval.department_name)}" data-department-id="${approval.department_id}"><i class="fa fa-check" aria-hidden="true"></i> Согласовать</button>` : 
                                (!approval.all_equipment_agreed && !approval.is_agreed ? 
                                    `<span class="approve-disabled-hint" title="Не всё оборудование подразделения согласовано"></span>` : 
                                    '')
                            }
                        </div>
                    </div>
                `;
            });
            
            approvalsHtml += '</div></div>';
        }
        
        html += `
            <div class="order-card" data-id="${order.id}" id="order-${order.id}">
                <div class="order-header" style="background:${colorStatus}">
                    <div class="order-header-content">
                        <div class="order-info" onclick="toggleOrderBody(${order.id})">
                            <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isChecked} onclick="event.stopPropagation()">
                            <h3><i class="fa fa-file-text-o" aria-hidden="true"></i> <span>№${order.id}</span> ${displayName}</h3>
                            <div class="order-date"><i class="fa fa-calendar"></i> ${startDate} - ${endDateStr}</div>
                            ${ownerInfo}
                            ${feedbackButton}
                        </div>
                        <span class="order-status ${statusClass}">${statusIcon} ${statusText}</span>
                    </div>
                    <button class="order-toggle">▼</button>
                </div>
                ${approvalsHtml}
                <div class="order-body" id="order-body-${order.id}">
                    ${commentHtml}
                    <div id="order-items-${order.id}">
                        <div class="loading">Загрузка позиций...</div>
                    </div>
                </div>
            </div>`;
    });
    
    $('#ordersContainer').html(html + '</div>');
    
    // Обработчики для кнопок toggle
    $('.order-toggle').off('click').on('click', function(e) {
        e.stopPropagation();
        const $card = $(this).closest('.order-card');
        const orderId = $card.data('id');
        toggleOrderBody(orderId);
    });
    
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
    
    // Обработчики кнопок обратной связи
    $('.order-feedback-btn').off('click').on('click', function(e) {
        e.stopPropagation();
        const applicationId = $(this).data('application-id');
        const applicationName = $(this).data('application-name');
        window.location.href = `/feedback/application/${applicationId}/`;
    });
    
    // Обработчики кнопок согласования заявки
    $('.btn-approve-application').off('click').on('click', function(e) {
        e.stopPropagation();
        const applicationId = $(this).data('application-id');
        const departmentName = $(this).data('department-name');
        const departmentId = $(this).data('department-id');
        
        showConfirm(
            `Вы уверены, что хотите согласовать заявку №${applicationId} от подразделения "${departmentName}"?`,
            async () => {
                await approveApplication(applicationId, departmentId);
            }
        );
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

        console.log('===== ДАННЫЕ ЗАКАЗА =====');
        console.log('Полный ответ:', response);
        console.log('Order object:', response.order);
        console.log('Ключи в order:', Object.keys(response.order || {}));
        console.log('Наличие slots:', response.order?.slots);
        console.log('Наличие items:', response.order?.items);
        console.log('Наличие equipment:', response.order?.equipment);
        console.log('=========================');
        
        if (response.success) {
            currentEditingOrderData = response.order;

            const hasSlots = response.order.slots && response.order.slots.length > 0;

            if (hasSlots) {
                // Если есть слоты - используем специальный редактор слотов
                displayEditSlotsOrderModal(response.order);
            } else {
                // Обычный редактор
                displayEditOrderModal(response.order);
            }

        } else {
            showNotification(response.error || 'Ошибка загрузки заказа', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка загрузки данных заказа', 'error');
    }
};

// Отображение модального окна редактирования заказа со слотами
const displayEditSlotsOrderModal = (order) => {
    console.log('Отображение редактора слотов для заказа:', order);
    console.log('Слоты (должны быть сгруппированы):', order.slots);
    
    // Правильное преобразование дат
    const startDate = formatDateTimeForInput(order.date_time_start);
    const endDate = formatDateTimeForInput(order.date_time_end);
    
    // Получаем слоты (уже сгруппированные на бэкэнде)
    let slots = order.slots || [];
    
    if (slots.length === 0) {
        $('#editOrderContent').html('<div class="text-center" style="padding: 2rem;">Нет слотов для редактирования</div>');
        $('#editOrderModal').css('display', 'flex');
        return;
    }
    
    // Сортируем слоты по дате начала
    slots.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    
    let slotsHtml = '';
    
    slots.forEach((slot, slotIndex) => {
        // Форматируем дату и время слота
        const slotStart = new Date(slot.date_start);
        const slotEnd = new Date(slot.date_end);
        
        const slotDateFormatted = slotStart.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        const startTimeFormatted = slotStart.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const endTimeFormatted = slotEnd.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Генерируем HTML для списка оборудования (ВСЕ оборудование этого слота)
        let equipmentHtml = '';
        
        if (slot.equipment && slot.equipment.length > 0) {
            slot.equipment.forEach(eq => {
                const commonBadge = eq.is_common ? 
                    '<span class="common-badge-mini"><i class="fa fa-globe"></i></span>' : '';
                
                equipmentHtml += `
                    <div class="edit-slot-equipment-row" data-eq-id="${eq.equipment_id}" data-is-common="${eq.is_common || false}">
                        <div class="edit-slot-equipment-name">
                            ${commonBadge}
                            <span>${escapeHtml(eq.equipment_name)}</span>
                            <span class="edit-slot-equipment-type-badge">${escapeHtml(eq.type_name || 'Оборудование')}</span>
                        </div>
                        <div class="edit-slot-equipment-controls">
                            <div class="edit-slot-equipment-quantity">
                                <input type="number" 
                                       class="edit-slot-qty" 
                                       data-eq-id="${eq.equipment_id}"
                                       data-is-common="${eq.is_common || false}"
                                       data-type-name="${escapeHtml(eq.type_name || 'Оборудование')}"
                                       data-equipment-name="${escapeHtml(eq.equipment_name)}"
                                       data-max="${eq.max_quantity || eq.quantity}"
                                       value="${eq.quantity}"
                                       min="0"
                                       max="${eq.max_quantity || eq.quantity}"
                                       step="1">
                                <span class="qty-unit">шт.</span>
                            </div>
                            <button type="button" class="edit-slot-remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить оборудование">
                                <i class="fa fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            equipmentHtml = '<div class="edit-slot-no-equipment">Нет оборудования</div>';
        }
        
        slotsHtml += `
            <div class="edit-slot-group" data-slot-index="${slotIndex}" data-slot-start="${slot.date_start}" data-slot-end="${slot.date_end}">
                <div class="edit-slot-group-header">
                    <div class="edit-slot-group-title">
                        <i class="fa fa-calendar" aria-hidden="true"></i>
                        <span class="slot-date-display">${slotDateFormatted}</span>
                        <i class="fa fa-clock-o" aria-hidden="true"></i>
                        <span class="slot-time-display">${startTimeFormatted} - ${endTimeFormatted}</span>
                    </div>
                    <button type="button" class="edit-slot-group-remove-btn" data-slot-index="${slotIndex}" title="Удалить слот">
                        <i class="fa fa-trash" aria-hidden="true"></i> Удалить слот
                    </button>
                </div>
                <div class="edit-slot-equipment-list">
                    ${equipmentHtml}
                </div>
                <div class="edit-slot-group-footer">
                    <button type="button" class="edit-slot-add-equipment-btn" data-slot-index="${slotIndex}">
                        <i class="fa fa-plus" aria-hidden="true"></i> Добавить оборудование
                    </button>
                </div>
            </div>
        `;
    });
    
    const modalContent = `
        <div class="edit-slots-container">
            <div class="edit-location-info">
                <p><strong><i class="fa fa-map-pin"></i> Локация:</strong> ${escapeHtml(order.location_name)}</p>
                <div class="date-fields" style="margin-top: 1rem; padding: 0;">
                    <div class="date-field">
                        <label><i class="fa fa-calendar"></i> Общая дата начала заявки</label>
                        <input type="datetime-local" id="editOrderCommonStart" class="date-input" value="${startDate}">
                    </div>
                    <div class="date-field">
                        <label><i class="fa fa-clock-o" aria-hidden="true"></i> Общая дата окончания заявки</label>
                        <input type="datetime-local" id="editOrderCommonEnd" class="date-input" value="${endDate}">
                    </div>
                </div>
            </div>
            <div class="edit-comment-section">
                <label><i class="fa fa-comment-o" aria-hidden="true"></i> Комментарий к заказу</label>
                <textarea id="editOrderComment" class="edit-comment-input" rows="2">${escapeHtml(order.comment || '')}</textarea>
            </div>
            <div class="edit-slots-list">
                ${slotsHtml}
            </div>
            <button id="addNewSlotToEditOrder" class="btn-add-slot">
                <i class="fa fa-plus" aria-hidden="true"></i> Добавить новый слот
            </button>
        </div>
    `;
    
    $('#editOrderContent').html(modalContent);
    $('#editOrderModal').css('display', 'flex');
    
    bindEditSlotsOrderHandlers();
};

// Привязка обработчиков для редактора слотов
const bindEditSlotsOrderHandlers = () => {
    // Сохранение
    $('#saveEditBtn').off('click').on('click', () => {
        saveEditedSlotsOrder();
    });
    
    // Удаление слота
    $('.edit-slot-group-remove-btn').off('click').on('click', function() {
        const slotIndex = $(this).data('slot-index');
        $(`.edit-slot-group[data-slot-index="${slotIndex}"]`).remove();
        reindexEditSlotGroups();
        showNotification('Слот удален', 'info');
    });
    
    // Удаление оборудования из слота
    $('.edit-slot-remove-equipment-btn').off('click').on('click', function() {
        const $btn = $(this);
        const eqId = $btn.data('eq-id');
        const $slotGroup = $btn.closest('.edit-slot-group');
        
        $(`.edit-slot-equipment-row[data-eq-id="${eqId}"]`, $slotGroup).remove();
        
        // Если в слоте не осталось оборудования, показываем сообщение
        const $equipmentList = $slotGroup.find('.edit-slot-equipment-list');
        if ($equipmentList.find('.edit-slot-equipment-row').length === 0) {
            $equipmentList.html('<div class="edit-slot-no-equipment">Нет оборудования</div>');
        }
        
        showNotification('Оборудование удалено из слота', 'info');
    });
    
    // Изменение количества оборудования
    $('.edit-slot-qty').off('change').on('change', function() {
        let val = parseInt($(this).val());
        const max = parseInt($(this).data('max'));
        if (isNaN(val)) val = 0;
        if (val < 0) val = 0;
        if (val > max) val = max;
        $(this).val(val);
    });
    
    // Добавление оборудования в слот
    $('.edit-slot-add-equipment-btn').off('click').on('click', function() {
        const slotIndex = $(this).data('slot-index');
        openAddEquipmentForSlot(slotIndex);
    });
    
    // Добавление нового слота
    $('#addNewSlotToEditOrder').off('click').on('click', () => {
        addNewEmptySlot();
    });
};

// Открытие модального окна добавления оборудования для слота
const openAddEquipmentForSlot = async (slotIndex) => {
    if (!currentEditingOrderData) return;
    
    const locationId = currentEditingOrderData.location_id;
    
    try {
        const response = await api.getEquipment(locationId, []);
        
        if (response.success && response.equipment) {
            displayAvailableEquipmentForSlot(slotIndex, response.equipment);
        } else {
            showNotification('Ошибка загрузки оборудования', 'error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showNotification('Ошибка загрузки оборудования', 'error');
    }
};

// Отображение доступного оборудования для слота
const displayAvailableEquipmentForSlot = (slotIndex, equipment) => {
    const $slotGroup = $(`.edit-slot-group[data-slot-index="${slotIndex}"]`);
    
    // Получаем уже добавленные ID оборудования
    const addedIds = [];
    $slotGroup.find('.edit-slot-equipment-row').each(function() {
        const eqId = $(this).data('eq-id');
        if (eqId) addedIds.push(parseInt(eqId));
    });
    
    // Группируем оборудование по типам
    const typesMap = new Map();
    
    equipment.forEach(eq => {
        if (!addedIds.includes(eq.equipment_id)) {
            const typeName = eq.type_name;
            if (!typesMap.has(typeName)) {
                typesMap.set(typeName, []);
            }
            typesMap.get(typeName).push(eq);
        }
    });
    
    if (typesMap.size === 0) {
        $('#addEquipmentContent').html('<div class="text-center" style="padding: 2rem;">Все оборудование уже добавлено</div>');
        $('#addEquipmentModal').css('display', 'flex');
        $('#addEquipmentModal').data('current-slot-index', slotIndex);
        
        $('#confirmAddEquipmentBtn').off('click').one('click', () => {
            const currentSlotIndex = $('#addEquipmentModal').data('current-slot-index');
            addEquipmentToSlot(currentSlotIndex);
        });
        return;
    }
    
    let html = '<div class="available-equipment-list">';
    
    for (const [typeName, eqList] of typesMap) {
        html += `
            <div class="equipment-type-group">
                <div class="equipment-type-header">${escapeHtml(typeName)}</div>
        `;
        
        eqList.forEach(eq => {
            const commonBadge = eq.is_common ? 
                '<span class="common-badge-small"><i class="fa fa-globe"></i> Общее</span>' : '';
            
            html += `
                <div class="available-equipment-item" data-eq-id="${eq.equipment_id}" data-is-common="${eq.is_common || false}" data-type-name="${escapeHtml(typeName)}" data-eq-name="${escapeHtml(eq.name)}" data-max-qty="${eq.quantity}">
                    <div class="available-equipment-info">
                        <div class="available-equipment-name">
                            ${escapeHtml(eq.name)}
                            ${commonBadge}
                        </div>
                        <div class="available-equipment-stock">
                            <i class="fa fa-archive" aria-hidden="true"></i> Доступно: <strong>${eq.quantity}</strong> шт.
                        </div>
                    </div>
                    <div class="available-equipment-actions">
                        <label>Кол-во:</label>
                        <input type="number" 
                               min="0" 
                               max="${eq.quantity}" 
                               value="0" 
                               class="equipment-select-qty"
                               data-max="${eq.quantity}"
                               data-name="${escapeHtml(eq.name)}"
                               data-type="${escapeHtml(typeName)}"
                               data-is-common="${eq.is_common || false}"
                               data-eq-id="${eq.equipment_id}">
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    html += '</div>';
    
    $('#addEquipmentContent').html(html);
    $('#addEquipmentModal').css('display', 'flex');
    $('#addEquipmentModal').data('current-slot-index', slotIndex);
    
    $('#confirmAddEquipmentBtn').off('click').one('click', () => {
        const currentSlotIndex = $('#addEquipmentModal').data('current-slot-index');
        addEquipmentToSlot(currentSlotIndex);
    });
};

// Добавление выбранного оборудования в слот
const addEquipmentToSlot = (slotIndex) => {
    const $slotGroup = $(`.edit-slot-group[data-slot-index="${slotIndex}"]`);
    let $equipmentList = $slotGroup.find('.edit-slot-equipment-list');
    
    // Удаляем заглушку "Нет оборудования"
    if ($equipmentList.find('.edit-slot-no-equipment').length) {
        $equipmentList.html('');
    }
    
    let addedCount = 0;
    
    $('.available-equipment-item').each(function() {
        const $item = $(this);
        const eqId = $item.data('eq-id');
        const eqName = $item.data('eq-name');
        const typeName = $item.data('type-name');
        const qty = parseInt($item.find('.equipment-select-qty').val());
        const maxQty = $item.data('max-qty');
        const isCommon = $item.data('is-common') === true;
        
        if (qty > 0 && !isNaN(qty)) {
            // Проверяем, есть ли уже такое оборудование
            const $existing = $equipmentList.find(`.edit-slot-equipment-row[data-eq-id="${eqId}"]`);
            
            if ($existing.length) {
                // Обновляем количество
                const $qtyInput = $existing.find('.edit-slot-qty');
                const newQty = Math.min(parseInt($qtyInput.val()) + qty, maxQty);
                $qtyInput.val(newQty);
            } else {
                // Добавляем новое оборудование
                const commonBadge = isCommon ? 
                    '<span class="common-badge-mini"><i class="fa fa-globe"></i></span>' : '';
                
                const equipmentHtml = `
                    <div class="edit-slot-equipment-row" data-eq-id="${eqId}" data-is-common="${isCommon}">
                        <div class="edit-slot-equipment-name">
                            ${commonBadge}
                            <span>${escapeHtml(eqName)}</span>
                            <span class="edit-slot-equipment-type-badge">${escapeHtml(typeName)}</span>
                        </div>
                        <div class="edit-slot-equipment-controls">
                            <div class="edit-slot-equipment-quantity">
                                <input type="number" 
                                       class="edit-slot-qty" 
                                       data-eq-id="${eqId}"
                                       data-is-common="${isCommon}"
                                       data-type-name="${escapeHtml(typeName)}"
                                       data-equipment-name="${escapeHtml(eqName)}"
                                       data-max="${maxQty}"
                                       value="${qty}"
                                       min="0"
                                       max="${maxQty}"
                                       step="1">
                                <span class="qty-unit">шт.</span>
                            </div>
                            <button type="button" class="edit-slot-remove-equipment-btn" data-eq-id="${eqId}" title="Удалить оборудование">
                                <i class="fa fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                `;
                $equipmentList.append(equipmentHtml);
            }
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        // Привязываем обработчики к новым элементам
        $equipmentList.find('.edit-slot-qty').off('change').on('change', function() {
            let val = parseInt($(this).val());
            const max = parseInt($(this).data('max'));
            if (isNaN(val)) val = 0;
            if (val < 0) val = 0;
            if (val > max) val = max;
            $(this).val(val);
        });
        
        $equipmentList.find('.edit-slot-remove-equipment-btn').off('click').on('click', function() {
            const $btn = $(this);
            const eqIdToRemove = $btn.data('eq-id');
            $btn.closest('.edit-slot-equipment-row').remove();
            
            if ($equipmentList.find('.edit-slot-equipment-row').length === 0) {
                $equipmentList.html('<div class="edit-slot-no-equipment">Нет оборудования</div>');
            }
            showNotification('Оборудование удалено из слота', 'info');
        });
        
        showNotification(`Добавлено ${addedCount} позиций`, 'success');
    } else {
        if ($equipmentList.children().length === 0) {
            $equipmentList.html('<div class="edit-slot-no-equipment">Нет оборудования</div>');
        }
        showNotification('Выберите оборудование для добавления (укажите количество больше 0)', 'warning');
    }
    
    $('#addEquipmentModal').hide();
};

// Добавление нового пустого слота
const addNewEmptySlot = () => {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60000);
    
    const slotDateFormatted = now.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const startTimeFormatted = now.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const endTimeFormatted = nextHour.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const slotIndex = $('.edit-slot-group').length;
    
    const slotHtml = `
        <div class="edit-slot-group" data-slot-index="${slotIndex}">
            <div class="edit-slot-group-header">
                <div class="edit-slot-group-title">
                    <i class="fa fa-calendar" aria-hidden="true"></i>
                    <input type="date" class="slot-date-input" value="${now.toISOString().split('T')[0]}" style="width: 120px;">
                    <i class="fa fa-clock-o" aria-hidden="true"></i>
                    <input type="time" class="slot-time-start-input" value="${now.toTimeString().slice(0, 5)}" style="width: 80px;">
                    -
                    <input type="time" class="slot-time-end-input" value="${nextHour.toTimeString().slice(0, 5)}" style="width: 80px;">
                </div>
                <button type="button" class="edit-slot-group-remove-btn" data-slot-index="${slotIndex}" title="Удалить слот">
                    <i class="fa fa-trash" aria-hidden="true"></i> Удалить слот
                </button>
            </div>
            <div class="edit-slot-equipment-list">
                <div class="edit-slot-no-equipment">Нет оборудования</div>
            </div>
            <div class="edit-slot-group-footer">
                <button type="button" class="edit-slot-add-equipment-btn" data-slot-index="${slotIndex}">
                    <i class="fa fa-plus" aria-hidden="true"></i> Добавить оборудование
                </button>
            </div>
        </div>
    `;
    
    $('.edit-slots-list').append(slotHtml);
    bindEditSlotsOrderHandlers();
    showNotification('Новый слот добавлен', 'success');
};

// Переиндексация групп слотов после удаления
const reindexEditSlotGroups = () => {
    $('.edit-slot-group').each(function(newIndex) {
        $(this).attr('data-slot-index', newIndex);
        $(this).find('.edit-slot-group-remove-btn').attr('data-slot-index', newIndex);
        $(this).find('.edit-slot-add-equipment-btn').attr('data-slot-index', newIndex);
        $(this).find('.edit-slot-qty').attr('data-slot-index', newIndex);
    });
};

// Сохранение отредактированного заказа со слотами
const saveEditedSlotsOrder = async () => {
    if (!currentEditingOrderId) return;
    
    const newCommonStart = $('#editOrderCommonStart').val();
    const newCommonEnd = $('#editOrderCommonEnd').val();
    const newComment = $('#editOrderComment').val();
    
    const newSlots = [];
    let hasError = false;
    
    $('.edit-slot-group').each(function(index) {
        const $slotGroup = $(this);
        
        let dateStart, dateEnd;
        
        // Пытаемся получить даты из полей ввода (для новых слотов)
        const $dateInput = $slotGroup.find('.slot-date-input');
        const $startTimeInput = $slotGroup.find('.slot-time-start-input');
        const $endTimeInput = $slotGroup.find('.slot-time-end-input');
        
        if ($dateInput.length && $startTimeInput.length && $endTimeInput.length) {
            // Новый слот с полями ввода
            const dateStr = $dateInput.val();
            const startTimeStr = $startTimeInput.val();
            const endTimeStr = $endTimeInput.val();
            
            if (dateStr && startTimeStr && endTimeStr) {
                dateStart = `${dateStr}T${startTimeStr}`;
                dateEnd = `${dateStr}T${endTimeStr}`;
            } else {
                showNotification(`Ошибка: не указаны даты для слота ${index + 1}`, 'error');
                hasError = true;
                return false;
            }
        } else {
            // Существующий слот - берем из отображаемых данных
            const $dateSpan = $slotGroup.find('.slot-date-display');
            const $timeSpan = $slotGroup.find('.slot-time-display');
            
            if ($dateSpan.length && $timeSpan.length) {
                const dateText = $dateSpan.text().trim();
                const timeText = $timeSpan.text().trim();
                const [startTime, endTime] = timeText.split(' - ');
                
                // Парсим дату из формата "DD.MM.YYYY"
                const dateParts = dateText.split('.');
                if (dateParts.length === 3) {
                    const year = dateParts[2];
                    const month = dateParts[1];
                    const day = dateParts[0];
                    dateStart = `${year}-${month}-${day}T${startTime}`;
                    dateEnd = `${year}-${month}-${day}T${endTime}`;
                } else {
                    showNotification(`Ошибка: не удалось распознать дату для слота ${index + 1}`, 'error');
                    hasError = true;
                    return false;
                }
            } else {
                showNotification(`Ошибка: не удалось распознать дату для слота ${index + 1}`, 'error');
                hasError = true;
                return false;
            }
        }
        
        if (!dateStart || !dateEnd) {
            showNotification(`Ошибка: не указаны даты для слота ${index + 1}`, 'error');
            hasError = true;
            return false;
        }
        
        const convertedStart = convertToServerDateFormat(dateStart);
        const convertedEnd = convertToServerDateFormat(dateEnd);
        
        const startDateObj = new Date(convertedStart);
        const endDateObj = new Date(convertedEnd);
        const now = new Date();
        
        if (startDateObj < now) {
            showNotification(`Дата начала слота ${index + 1} не может быть в прошлом`, 'error');
            hasError = true;
            return false;
        }
        if (endDateObj <= startDateObj) {
            showNotification(`Дата окончания слота ${index + 1} должна быть позже начала`, 'error');
            hasError = true;
            return false;
        }
        
        // Собираем оборудование
        const equipment = [];
        $slotGroup.find('.edit-slot-qty').each(function() {
            const $input = $(this);
            const eqId = $input.data('eq-id');
            const eqName = $input.data('equipment-name');
            const eqType = $input.data('type-name');
            const quantity = parseInt($input.val());
            const isCommon = $input.data('is-common') === true;
            
            if (quantity > 0 && !isNaN(quantity)) {
                equipment.push({
                    equipment_id: eqId,
                    equipment_name: eqName,
                    type_name: eqType,
                    quantity: quantity,
                    max_quantity: quantity,
                    is_common: isCommon
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
    
    const saveBtn = $('#saveEditBtn');
    const originalText = saveBtn.text();
    saveBtn.prop('disabled', true).text('Сохранение...');
    
    try {
        const updateData = {
            date_time_start: newCommonStart,
            date_time_end: newCommonEnd,
            comment: newComment,
            slots: newSlots,
            type: 'slots'
        };
        
        console.log('Отправляем данные на сервер:', updateData);
        
        const response = await api.updateOrder(currentEditingOrderId, updateData);
        
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
            const commonBadge = eq.is_common ? '<span class="common-badge-small"><i class="fa fa-globe"></i> Общее</span>' : '';
            
            equipmentHtml += `
                <div class="edit-equipment-item" data-eq-id="${eq.equipment_id}" data-eq-index="${index}" data-is-common="${eq.is_common}">
                    <div class="edit-equipment-info">
                        <div class="edit-equipment-name">
                            ${escapeHtml(eq.equipment_name)}
                            ${commonBadge}
                        </div>
                        <div class="edit-equipment-type">${escapeHtml(eq.type_name)}</div>
                        <div class="edit-equipment-available">
                            <i class="fa fa-archive" aria-hidden="true"></i> Всего: ${eq.max_quantity || eq.quantity} шт.
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
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить"><i class="fa fa-trash" aria-hidden="true"></i></button>
                    </div>
                </div>
            `;
        });
    } else {
        equipmentHtml += '<div class="text-center" style="padding: 1rem; color: #94a3b8;">Нет оборудования</div>';
    }
    
    equipmentHtml += '</div>';
    
    const modalContent = `
        <div class="edit-location-info" hidden>
            <p><strong><i class="fa fa-map-pin"></i> Локация:</strong> ${escapeHtml(order.location_name)}</p>
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
            <textarea id="editComment" class="edit-comment-input" rows="3" placeholder="Введите комментарий...">${escapeHtml(order.comment || '')}</textarea>
        </div>
        <div class="edit-equipment-header">
            <h4>Оборудование</h4>
            <button id="addMoreEquipmentBtn" class="add-equipment-btn">Добавить оборудование</button>
        </div>
        ${equipmentHtml}
    `;
    
    $('#editOrderContent').html(modalContent);
    // $('#editOrderModal').show();
    $('#editOrderModal').css('display', 'flex');
    
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
                        <div class="available-equipment-stock"><i class="fa fa-archive" aria-hidden="true"></i> Доступно: ${eq.quantity} шт.</div>
                    </div>
                    <div class="available-equipment-actions">
                        <label>Кол-во:</label>
                        <input type="number" 
                               min="0" 
                               max="${eq.quantity}" 
                               value="0" 
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
    $('#addEquipmentModal').css('display', 'flex');
    
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
                        <div class="edit-equipment-available"><i class="fa fa-archive" aria-hidden="true"></i> Всего: ${eq.max_quantity} шт.</div>
                    </div>
                    <div class="edit-equipment-control">
                        <input type="number" 
                               min="0" 
                               max="${eq.max_quantity}" 
                               value="${eq.quantity}" 
                               class="edit-qty-input" 
                               data-eq-id="${eq.equipment_id}"
                               data-max="${eq.max_quantity}">
                        <button class="remove-equipment-btn" data-eq-id="${eq.equipment_id}" title="Удалить"><i class="fa fa-trash" aria-hidden="true"></i></button>
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
            // Сохраняем статус заявки для использования в displayOrderItems
            if (res.application_status) {
                // Обновляем статус в глобальном массиве allOrders
                const orderIndex = allOrders.findIndex(o => o.id === orderId);
                if (orderIndex !== -1) {
                    allOrders[orderIndex].status = res.application_status;
                }
            }
            displayOrderItems(orderId, res.items, res.can_edit || false);
        } else {
            $(`#order-items-${orderId}`).html(`<div class="no-orders">❌ ${escapeHtml(res.error)}</div>`);
        }
    } catch (error) {
        console.error('Ошибка:', error);
        $(`#order-items-${orderId}`).html('<div class="no-orders">❌ Ошибка загрузки позиций</div>');
    }
};

// Отображение позиций заказа с кнопками
export const displayOrderItems = async (applicationId, items, canEdit = false) => {
    if (!items?.length) {
        $(`#order-items-${applicationId}`).html('<div class="no-orders">Нет позиций в заявке</div>');
        return;
    }
    
    // Загружаем подразделения пользователя и типы оборудования
    const { userDepartments, departmentTypes, canEditApproval } = await loadUserDepartmentAndTypes();
    
    // Получаем статус заявки из глобального массива allOrders
    const application = allOrders.find(o => o.id === applicationId);
    const applicationStatus = application ? application.status : 'new';
    
    // Редактирование доступно только если статус 'new' (Новая)
    const now = new Date();
    const orderEndDate = application?.date_time_end ? new Date(application.date_time_end) : null;
    const isExpired = orderEndDate && orderEndDate < now;
    const canEditOrder = canEdit && (applicationStatus === 'new') && !isExpired;
    
    console.log('Заявка ID:', applicationId);
    console.log('Статус заявки:', applicationStatus);
    console.log('Можно редактировать заказ:', canEditOrder);
    
    // ========== ГРУППИРУЕМ СНАЧАЛА ПО order_id, ПОТОМ ПО СЛОТАМ ==========
    const ordersByOrderId = new Map();
    
    items.forEach(item => {
        const orderId = item.order_id;
        
        if (!ordersByOrderId.has(orderId)) {
            ordersByOrderId.set(orderId, {
                order_id: orderId,
                location_id: item.location_id,
                location_name: item.location_name,
                order_comment: item.order_comment || '',
                common_date_start: item.date_start,
                common_date_end: item.date_end,
                slotGroups: new Map(),
                regularItems: []
            });
        }
        
        const orderData = ordersByOrderId.get(orderId);
        
        if (item.is_slot === true && item.slot_date_start && item.slot_date_end) {
            const slotTimeKey = `${item.slot_date_start}_${item.slot_date_end}`;
            if (!orderData.slotGroups.has(slotTimeKey)) {
                orderData.slotGroups.set(slotTimeKey, {
                    items: [],
                    slot_date_start: item.slot_date_start,
                    slot_date_end: item.slot_date_end
                });
            }
            orderData.slotGroups.get(slotTimeKey).items.push(item);
        } else {
            orderData.regularItems.push(item);
        }
    });
    
    // ========== ПРОВЕРКА ПЕРЕСЕЧЕНИЙ МЕЖДУ РАЗНЫМИ ЗАЯВКАМИ ДЛЯ КОНКРЕТНОЙ ЛОКАЦИИ ==========
    
    const checkOverlap = (date1_start, date1_end, date2_start, date2_end) => {
        if (!date1_start || !date1_end || !date2_start || !date2_end) return false;
        const start1 = new Date(date1_start);
        const end1 = new Date(date1_end);
        const start2 = new Date(date2_start);
        const end2 = new Date(date2_end);
        return (start1 < end2 && start2 < end1);
    };
    
    const formatDateTime = (dateStr) => {
        if (!dateStr) return 'Дата не указана';
        const date = new Date(dateStr);
        return date.toLocaleString('ru-RU', {
            day: 'numeric', month: 'long',
            hour: '2-digit', minute: '2-digit'
        });
    };
    
    // Функция получения HTML иконки для конкретного помещения
    const getOverlapIconHtmlForLocation = (locationName, currentDateStart, currentDateEnd) => {
        const overlappingApps = [];
        
        for (const otherApp of allOrders) {
            if (otherApp.id === applicationId) continue;
            if (!otherApp.date_time_start || !otherApp.date_time_end) continue;
            
            // ПРОВЕРКА: использует ли другая заявка ТО ЖЕ САМОЕ помещение?
            const otherAppLocations = otherApp.locations || [];
            if (!otherAppLocations.includes(locationName)) continue;  // ← КЛЮЧЕВАЯ ПРОВЕРКА
            
            // Проверяем пересечение дат
            if (checkOverlap(currentDateStart, currentDateEnd, otherApp.date_time_start, otherApp.date_time_end)) {
                overlappingApps.push({
                    app2_id: otherApp.id,
                    app2_name: otherApp.application_name || `Заявка №${otherApp.id}`,
                    date2: formatDateTime(otherApp.date_time_start),
                    end2: formatDateTime(otherApp.date_time_end)
                });
            }
        }
        
        if (!overlappingApps.length) return '';
        
        let tooltipText = `Обнаружены пересечения по датам для помещения "${locationName}":\n`;
        overlappingApps.forEach((overlap, idx) => {
            tooltipText += `\n${idx + 1}. ${overlap.app2_name}: ${overlap.date2} - ${overlap.end2}`;
        });
        
        return `<span class="overlap-warning-icon" title="${escapeHtml(tooltipText)}"><i class="fa fa-exclamation fa-lg" aria-hidden="true" style="color:orange;"></i>  </span>`;
    };
    
    // ========== ГЕНЕРАЦИЯ HTML ==========
    let html = '';

    const canViewOverlaps = userPermissions.can_view_all || userPermissions.can_edit_all || userPermissions.is_superuser;
    
    for (const [_, orderData] of ordersByOrderId) {
        // Форматируем общую дату помещения
        const commonStartDate = orderData.common_date_start ? new Date(orderData.common_date_start).toLocaleDateString('ru-RU') : 'Дата не указана';
        const commonEndDate = orderData.common_date_end ? new Date(orderData.common_date_end).toLocaleDateString('ru-RU') : 'Дата не указана';
        
        // Получаем иконку для КОНКРЕТНОГО помещения (только для пользователей с правами)
        let locationOverlapIcon = '';
        if (canViewOverlaps) {
            locationOverlapIcon = getOverlapIconHtmlForLocation(
                orderData.location_name,
                orderData.common_date_start,
                orderData.common_date_end
            );
        }
        
        // Кнопки действий (один раз на весь заказ)
        const showActionButtons = canEditOrder && (applicationStatus === 'new');
        const actionButtons = showActionButtons ? `
            <div class="order-card-actions">
                <button class="order-edit-btn-small" data-order-id="${orderData.order_id}" title="Редактировать заказ"><i class="fa fa-pencil" aria-hidden="true"></i> Редактировать</button>
                <button class="order-cancel-btn-small" data-order-id="${orderData.order_id}" title="Отменить заказ"><i class="fa fa-times-circle-o" aria-hidden="true"></i> Отменить</button>
                <!-- <button class="order-duplicate-btn-small" data-order-id="${orderData.order_id}" title="Создать копию"><i class="fa fa-file-text-o" aria-hidden="true"></i> Копировать</button> -->
            </div>
        ` : '';
        
        // Начинаем контейнер заказа
        let orderCardHtml = `
            <div class="location-order-card" data-order-id="${orderData.order_id}">
                <div class="location-order-header">
                    <div class="location-order-info">
                        <span class="location-name">
                            <i class="fa fa-map-pin"></i> ${escapeHtml(orderData.location_name)} 
                        </span>
                        <span class="location-common-dates"><i class="fa fa-calendar"></i> ${commonStartDate} - ${commonEndDate}</span>
                        ${locationOverlapIcon}
                    </div>
                    ${actionButtons}
                </div>
        `;
        
        // ========== 1. ОТОБРАЖАЕМ ВСЕ СЛОТЫ ==========
        if (orderData.slotGroups.size > 0) {
            const sortedSlotGroups = Array.from(orderData.slotGroups.entries());
            sortedSlotGroups.sort((a, b) => {
                const dateA = new Date(a[1].slot_date_start);
                const dateB = new Date(b[1].slot_date_start);
                return dateA - dateB;
            });
            
            for (const [slotKey, slotGroup] of sortedSlotGroups) {
                const slotItems = slotGroup.items;
                const firstSlot = slotItems[0];
                
                const startTime = firstSlot.slot_date_start ? new Date(firstSlot.slot_date_start).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : '';
                const endTime = firstSlot.slot_date_end ? new Date(firstSlot.slot_date_end).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : '';
                const slotTimeBadge = `<span class="slot-time-badge"><i class="fa fa-clock-o" aria-hidden="true"></i> ${startTime} - ${endTime}</span>`;
                
                const typesMap = new Map();
                slotItems.forEach(item => {
                    const typeName = item.type_name;
                    if (!typesMap.has(typeName)) {
                        typesMap.set(typeName, []);
                    }
                    const equipmentName = item.is_common ? `${item.equipment_name}` : item.equipment_name;
                    typesMap.get(typeName).push({
                        name: equipmentName,
                        quantity: item.quantity,
                        is_common: item.is_common || false,
                        equipment_id: item.equipment_id,
                        type_name: item.type_name,
                        order_item_id: item.id,
                        can_provide: item.can_provide || 0,
                        is_agreed: item.is_agreed || false,
                        is_slot: true,
                        slot_date_start: item.slot_date_start,
                        slot_date_end: item.slot_date_end
                    });
                });
                
                orderCardHtml += generateSlotTableHtml(
                    orderData.order_id,
                    typesMap,
                    slotTimeBadge,
                    userDepartments,
                    departmentTypes,
                    canEditApproval,
                    applicationStatus
                );
            }
        }
        
        // ========== 2. ОТОБРАЖАЕМ ОБЫЧНЫЕ ПОЗИЦИИ ==========
        if (orderData.regularItems.length > 0) {
            const typesMap = new Map();
            
            orderData.regularItems.forEach(item => {
                const typeName = item.type_name;
                if (!typesMap.has(typeName)) {
                    typesMap.set(typeName, []);
                }
                const equipmentName = item.is_common ? `${item.equipment_name}` : item.equipment_name;
                typesMap.get(typeName).push({
                    name: equipmentName,
                    quantity: item.quantity,
                    is_common: item.is_common || false,
                    equipment_id: item.equipment_id,
                    type_name: item.type_name,
                    order_item_id: item.id,
                    can_provide: item.can_provide || 0,
                    is_agreed: item.is_agreed || false,
                    is_slot: false,
                    slot_date_start: null,
                    slot_date_end: null
                });
            });
            
            orderCardHtml += generateRegularTableHtml(
                orderData.order_id,
                typesMap,
                userDepartments,
                departmentTypes,
                canEditApproval,
                applicationStatus
            );
        }
        
        // Добавляем комментарий
        if (orderData.order_comment) {
            orderCardHtml += `
                <div class="order-comment-inline">
                    <span class="comment-label">Комментарий:</span>
                    <span class="comment-text">${escapeHtml(orderData.order_comment)}</span>
                </div>
            `;
        }
        
        orderCardHtml += `</div>`;
        html += orderCardHtml;
    }
    
    $(`#order-items-${applicationId}`).html(html);
    
    // Привязываем обработчики
    if (canEditApproval && (applicationStatus === 'new' || applicationStatus === 'in_progress')) {
        bindApprovalControls();
    }
    
    if (canEditOrder) {
        bindOrderCardButtons();
    }
};
// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ГЕНЕРАЦИИ HTML ==========

// Генерация HTML для таблицы слота
const generateSlotTableHtml = (orderId, typesMap, slotTimeBadge, userDepartments, departmentTypes, canEditApproval, applicationStatus) => {
    const allTypes = Array.from(typesMap.keys());
    const maxRows = getMaxRows(typesMap);
    
    return `
        <div class="slot-table-wrapper">
            <div class="slot-header">
                ${slotTimeBadge}
            </div>
            <div class="equipment-matrix">
                <table class="equipment-matrix-table">
                    <thead>
                        <tr>
                            ${allTypes.map(type => `<th class="type-col">${escapeHtml(type)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${generateTableRows(typesMap, allTypes, maxRows, orderId, '', userDepartments, departmentTypes, canEditApproval, applicationStatus)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

// Генерация HTML для таблицы обычного заказа (не слоты)
const generateRegularTableHtml = (orderId, typesMap, userDepartments, departmentTypes, canEditApproval, applicationStatus) => {
    const allTypes = Array.from(typesMap.keys());
    const maxRows = getMaxRows(typesMap);
    
    return `
        <div class="regular-table-wrapper">
            <div class="equipment-matrix">
                <table class="equipment-matrix-table">
                    <thead>
                        <tr>
                            ${allTypes.map(type => `<th class="type-col">${escapeHtml(type)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${generateTableRows(typesMap, allTypes, maxRows, orderId, '', userDepartments, departmentTypes, canEditApproval, applicationStatus)}
                    </tbody>
                </table>
            </div>
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
    // $('.order-duplicate-btn-small').off('click').on('click', function(e) {
    //     e.stopPropagation();
    //     const orderId = $(this).data('order-id');
    //     duplicateOrder(orderId);
    // });
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
const generateTableRows = (typesMap, allTypes, maxRows, orderId, locationId, userDepartments, departmentTypes, canEditApproval, applicationStatus) => {
    let rows = '';
    
    const typesData = [];
    for (const typeName of allTypes) {
        const equipmentList = typesMap.get(typeName) || [];
        equipmentList.sort((a, b) => a.name.localeCompare(b.name));
        
        const canProvide = departmentTypes.some(dt => dt.name === typeName);
        const departmentName = departmentTypes.find(dt => dt.name === typeName);
        const departmentNameStr = departmentName && departmentName.hasOwnProperty("department_name") ? departmentName.department_name : "";

        typesData.push({
            name: typeName,
            equipment: equipmentList,
            can_provide: canProvide,
            department_name: departmentNameStr
        });
    }

    // Для статусов 'in_progress', 'completed', 'cancelled' отключаем редактирование согласования
    const isApprovalEditable = canEditApproval && (applicationStatus === 'new');
    
    for (let i = 0; i < maxRows; i++) {
        let row = '<tr>';
        
        for (let j = 0; j < typesData.length; j++) {
            const typeData = typesData[j];
            const equipment = typeData.equipment[i];

            if (equipment) {
                const equipmentId = equipment.equipment_id || `eq_${i}_${j}`;
                const savedQuantity = equipment.can_provide || 0;
                const savedIsChecked = equipment.is_agreed || false;
                const canProvide = typeData.can_provide && isApprovalEditable;
                
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
                                   data-approval-dept="${escapeHtml(typeData.department_name)}"
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
                                       data-approval-dept="${escapeHtml(typeData.department_name)}"
                                       ${savedIsChecked ? 'checked' : ''}
                                       ${savedQuantity >= 0 && !savedIsChecked ? '' : 'disabled'}>
                                <span style="font-size: 0.7rem;">Согласовано</span>
                            </label>
                        </div>
                        ` : `
                        <div class="equipment-status" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #e2e8f0; text-align: right;">
                            <span style="font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 12px; background-color: ${savedIsChecked ? '#28a745' : '#ffc107'}; color: ${savedIsChecked ? 'white' : '#333'};">
                                ${savedIsChecked ? '✅ Согласовано' : '<i class="fa fa-hourglass-half" aria-hidden="true"></i>На согласовании'}
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
            
            // Получаем элементы DOM
            const $input = $(`.approval-quantity-input[data-order-item-id="${orderItemId}"]`);
            const $checkbox = $(`.approval-checkbox[data-order-item-id="${orderItemId}"]`);
            
            if ($input.length) {
                // Получаем данные из DOM
                const orderId = $input.data('order-id');
                const locationId = $input.data('location-id');
                const equipmentId = $input.data('equipment-id');
                
                // Очищаем localStorage
                if (orderId && locationId && equipmentId) {
                    const storageKey = `order_${orderId}_${locationId}`;
                    const savedValues = JSON.parse(localStorage.getItem(storageKey) || '{}');
                    delete savedValues[equipmentId];
                    localStorage.setItem(storageKey, JSON.stringify(savedValues));
                }
                
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
        const typeName = $input.data('type-name');
        
        let finalQuantity = quantity;
        if (quantity > maxQuantity) finalQuantity = maxQuantity;
        if (quantity < 0) finalQuantity = 0;
        $input.val(finalQuantity);
        
        const $checkbox = $(`.approval-checkbox[data-order-id="${orderId}"][data-location-id="${locationId}"][data-equipment-id="${equipmentId}"]`);
        
        if (finalQuantity >= 0) {
            $checkbox.prop('disabled', false);
        } else {
            $checkbox.prop('disabled', true);
            $checkbox.prop('checked', false);
            $input.prop('readonly', false);
            $input.css('background-color', 'white');
            saveApprovalToServer(orderItemId, finalQuantity, false);
        }
        
        const isChecked = $checkbox.is(':checked');
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
        const $input = $(`.approval-quantity-input[data-order-item-id="${orderItemId}"]`);
        const quantity = parseInt($input.val()) || 0;
        const inputTypeName = $input.data('type-name');  // переименовали
        
        if (isChecked) {
            $input.prop('readonly', true);
            $input.css('background-color', '#f0f0f0');
            showNotification(`${inputTypeName}: согласовано ${quantity} шт.`, 'success');
            if (orderItemId) {
                saveApprovalToServer(orderItemId, quantity, true);
            }

            // Получаем ID заявки из блока order-card
            const $orderCard = $input.closest('.order-card');
            const $approvalItem = $orderCard.find('.approval-item').first();
            const applicationId = $approvalItem.data('application-id');
            const deptName = $input.data('approval-dept');

            if (applicationId && deptName) {
                updateDepartmentButton(applicationId, deptName);
            }
            
        } else {
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
            fetch('/api/user/departments/').then(res => {
                if (!res.ok) throw new Error('Failed to load departments');
                return res.json();
            }),
            fetch('/api/user/department-types/').then(res => {
                if (!res.ok) throw new Error('Failed to load department types');
                return res.json();
            })
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

// Обновление информации о выделении
export const updateSelectionInfo = () => {
    $('.selection-info').remove();
    if (state.selectedOrders.size) {
        $('.button-group').prepend(`<span class="selection-info"><i class="fa fa-check" aria-hidden="true"></i> Выбрано: ${state.selectedOrders.size}</span>`);
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
const toggleOrderBody = (orderId) => {
    const $body = $(`#order-body-${orderId}`);
    const $toggle = $(`.order-card[data-id="${orderId}"] .order-toggle`);
    
    $body.toggleClass('show');
    $toggle.html($body.hasClass('show') ? '▲' : '▼');
};

// Экспорт заявок в Excel
export const exportOrdersToExcel = async () => {
    if (!state.selectedOrders.size) {
        showNotification('Выберите заявки для экспорта', 'warning');
        return;
    }
    
    const orderIds = Array.from(state.selectedOrders);
    console.log('Экспорт заявок:', orderIds);
    
    $('#exportOrdersBtn').prop('disabled', true).text('<i class="fa fa-hourglass-half" aria-hidden="true"></i> Экспорт...');
    
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
