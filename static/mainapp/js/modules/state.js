'use strict';

export let state = {
    currentLocation: null,
    selectedTypes: new Set(),
    currentEquipment: [],
    orderCart: [],
    selectedLocations: new Set(),
    selectedOrders: new Set(),
    currentRooms: []
};

// Структура обычного заказа:
// {
//     type: 'regular',
//     location_id: id,
//     location_name: name,
//     date_start: date,
//     date_end: date,
//     equipment: [...],
//     comment: ''
// }

// Структура заказа со слотами:
// {
//     type: 'slots',
//     location_id: id,
//     location_name: name,
//     comment: '',
//     slots: [
//         {
//             date_start: date,
//             date_end: date,
//             equipment: [...]
//         }
//     ]
// }

// Ключи для localStorage
const STORAGE_KEYS = {
    ORDER_CART: 'orderCart',
    SELECTED_LOCATIONS: 'selectedLocations',
    SELECTED_TYPES: 'selectedTypes'
};

// Сохранение корзины в localStorage
export const saveCart = () => {
    try {
        localStorage.setItem(STORAGE_KEYS.ORDER_CART, JSON.stringify(state.orderCart));
        localStorage.setItem(STORAGE_KEYS.SELECTED_LOCATIONS, JSON.stringify([...state.selectedLocations]));
        localStorage.setItem(STORAGE_KEYS.SELECTED_TYPES, JSON.stringify([...state.selectedTypes]));
        console.log('Корзина сохранена:', state.orderCart.length, 'позиций');
    } catch (error) {
        console.error('Ошибка сохранения корзины:', error);
    }
};

// Загрузка корзины из localStorage
export const loadCart = () => {
    try {
        const savedCart = localStorage.getItem(STORAGE_KEYS.ORDER_CART);
        const savedLocations = localStorage.getItem(STORAGE_KEYS.SELECTED_LOCATIONS);
        const savedTypes = localStorage.getItem(STORAGE_KEYS.SELECTED_TYPES);
        
        if (savedCart) {
            state.orderCart = JSON.parse(savedCart);
            console.log('Загружено заказов:', state.orderCart.length);
            
            // Нормализация данных - проверяем наличие всех полей
            state.orderCart.forEach((item, idx) => {
                if (!item.comment) item.comment = '';
                if (!item.equipment) item.equipment = [];
                console.log(`Заказ ${idx + 1}: ${item.location_name}, оборудование: ${item.equipment.length} позиций`);
            });
        }
        
        if (savedLocations) {
            state.selectedLocations = new Set(JSON.parse(savedLocations));
            state.selectedLocations.forEach(id => {
                $(`.location-item[data-id="${id}"]`).addClass('disabled');
            });
        }
        
        if (savedTypes) {
            state.selectedTypes = new Set(JSON.parse(savedTypes));
            // Восстанавливаем состояние чекбоксов типов
            state.selectedTypes.forEach(typeId => {
                $(`.type-item input[value="${typeId}"]`).prop('checked', true);
            });
        }
        
        console.log('Корзина загружена, позиций:', state.orderCart.length);
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        clearCart();
    }
};

// Очистка корзины
export const clearCart = () => {
    console.log('Очистка корзины...');
    state.orderCart = [];
    state.selectedLocations.clear();
    state.selectedTypes.clear();
    saveCart();
    
    // Снимаем блокировку с локаций
    $('.location-item').removeClass('disabled');
    // Снимаем выделение с типов
    $('.type-item input').prop('checked', false);
    
    console.log('Корзина очищена');
};

// Сброс всего состояния
export const resetState = () => {
    state.currentLocation = null;
    state.selectedTypes.clear();
    state.currentEquipment = [];
    state.orderCart = [];
    state.selectedLocations.clear();
    state.selectedOrders.clear();
    state.currentRooms = [];
    clearCart();
};