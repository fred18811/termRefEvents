const getCSRFToken = () => {
    return document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
};

// Настройка AJAX с CSRF
export const setupAjax = () => {
    $.ajaxSetup({
        beforeSend: (xhr, settings) => {
            if (settings.type === 'POST' && !/^https?:\/\//.test(settings.url)) {
                xhr.setRequestHeader('X-CSRFToken', getCSRFToken());
            }
        },
        xhrFields: {
            withCredentials: true
        }
    });
};

// API вызовы
export const api = {
    // ========== АВТОРИЗАЦИЯ ==========
    login: (username, password) => $.ajax({
        url: '/api/login/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ username, password })
    }),
    
    logout: () => $.ajax({
        url: '/api/logout/',
        method: 'POST',
        contentType: 'application/json'
    }),
    
    checkAuth: () => $.get('/api/check-auth/'),
    
    getUserInfo: () => $.get('/api/get-user-info/'),
    
    // ========== ЛОКАЦИИ И ОБОРУДОВАНИЕ ==========
    getLocationPhoto: (id) => $.get(`/api/location-photo/${id}/`),
    
    getEquipment: (locationId, typeIds) => $.get('/api/equipment-by-location/', {
        location_id: locationId,
        type_ids: typeIds
    }),
    
    getCommonEquipment: (typeIds) => $.get('/api/common-equipment/', {
        type_ids: typeIds
    }),
    
    checkEquipmentLocation: (locationId, equipmentId) => $.get('/api/check-equipment-location/', {
        location_id: locationId,
        equipment_id: equipmentId
    }),
    
    checkEquipmentAvailability: (locationId, dateStart, dateEnd, typeIds) => $.get('/api/check-equipment-availability/', {
        location_id: locationId,
        date_start: dateStart,
        date_end: dateEnd,
        type_ids: typeIds
    }),
    
    // ========== ЗАКАЗЫ И ЗАЯВКИ ==========
    // Создание заявки
    createApplication: (name, comment) => $.ajax({
        url: '/api/applications/create/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name, comment })
    }),
    
    // Сохранение заказа
    saveOrder: (data) => $.ajax({
        url: '/api/save-order/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data)
    }),
    
    // Сохранение нескольких заказов (устаревший метод, оставлен для совместимости)
    saveMultipleOrders: (data) => $.ajax({
        url: '/api/save-multiple-orders/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data)
    }),
    
    // Получение заказов
    getOrders: () => $.get('/api/get-orders/'),
    
    // Получение элементов заказа
    getOrderItems: (orderId) => $.get('/api/get-order-items/', { order_id: orderId }),
    
    // Экспорт заказов в Excel
    exportOrders: (orderIds) => $.ajax({
        url: '/api/export-orders-to-excel/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ order_ids: orderIds }),
        xhrFields: { responseType: 'blob' }
    }),
    
    // ========== ПОМЕЩЕНИЯ ==========
    getRooms: () => $.get('/api/get-rooms/'),
    
    getRoomDetails: (roomId) => $.get('/api/get-room-details/', { room_id: roomId }),
    
    // ========== ДАТЫ И ЗАНЯТОСТЬ ==========
    getBusyDates: (locationId) => $.get('/api/get-busy-dates/', { location_id: locationId }),
    
    checkDateTimeBusy: (locationId, dateStart, dateEnd) => $.get('/api/check-datetime-busy/', {
        location_id: locationId,
        date_start: dateStart,
        date_end: dateEnd
    }),
    
    // ========== ЭКСПОРТ ==========
    exportToExcel: (equipment, locationName) => $.ajax({
        url: '/api/export-to-excel/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            equipment: equipment,
            location_name: locationName
        }),
        xhrFields: { responseType: 'blob' }
    }),

    // ========== ИСТОРИЯ ==========
    getUserHistory: (limit = 50, offset = 0) => $.get('/api/history/', {
        limit: limit,
        offset: offset
    }),
    
    getAllHistory: (limit = 100, offset = 0) => $.get('/api/history/all/', {
        limit: limit,
        offset: offset
    }),
    
    clearOldHistory: (days = 30) => $.ajax({
        url: '/api/history/clear/',
        method: 'DELETE',
        data: { days: days }
    }),

     // ========== РЕДАКТИРОВАНИЕ ЗАКАЗОВ ==========
    getOrderDetails: (orderId) => $.get(`/api/order/${orderId}/`),
    
    updateOrder: (orderId, data) => $.ajax({
        url: `/api/order/${orderId}/update/`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(data)
    }),
    
    cancelOrder: (orderId) => $.ajax({
        url: `/api/order/${orderId}/cancel/`,
        method: 'DELETE',
        contentType: 'application/json'
    }),
    
    duplicateOrder: (orderId) => $.ajax({
        url: `/api/order/${orderId}/duplicate/`,
        method: 'POST',
        contentType: 'application/json'
    }),

    // ========== ОБРАТНАЯ СВЯЗЬ ==========
    sendFeedback: (name, comment) => $.ajax({
        url: '/api/feedback/create/',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            name: name || '',
            comment: comment
        })
    }),
    
    // Получить все отзывы (для админки)
    getAllFeedback: (limit = 50, offset = 0) => $.get('/api/feedback/all/', {
        limit: limit,
        offset: offset
    }),

    // ========== ПОДРАЗДЕЛЕНИЯ ==========
    getUserDepartments: () => $.get('/api/user/department/'),
};

// Экспорт CSRF токена для использования в других модулях
export { getCSRFToken };