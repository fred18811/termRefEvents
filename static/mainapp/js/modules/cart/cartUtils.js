import { state, saveCart } from '../state.js';
import { showNotification } from '../utils.js';
import { api } from '../api.js';

// Глобальное хранилище доступного оборудования
export let availableEquipment = [];
export let currentEditIndex = null;

// Установка доступного оборудования
export const setAvailableEquipment = (equipment) => {
    availableEquipment = equipment;
};

// Получение доступного оборудования
export const getAvailableEquipment = () => availableEquipment;

// Установка индекса редактируемого заказа
export const setCurrentEditIndex = (index) => {
    currentEditIndex = index;
};

// Получение индекса редактируемого заказа
export const getCurrentEditIndex = () => currentEditIndex;

// Форматирование даты для datetime-local input
export const formatDateTimeForInput = (isoString) => {
    if (!isoString) return '';
    
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        
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

// Преобразование даты из datetime-local в формат для сервера
export const convertToServerDateFormat = (dateStr) => {
    if (!dateStr) return null;
    
    // Если уже в формате с пробелом
    if (dateStr.includes(' ') && !dateStr.includes('T')) {
        if (dateStr.split(' ')[1].split(':').length === 2) {
            return dateStr + ':00';
        }
        return dateStr;
    }
    
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Группировка слотов по датам для отображения в корзине
export const groupSlotsByDateForCart = (slots) => {
    const groups = new Map();
    
    slots.forEach(slot => {
        const dateKey = new Date(slot.date_start).toDateString();
        if (!groups.has(dateKey)) {
            groups.set(dateKey, []);
        }
        groups.get(dateKey).push(slot);
    });
    
    for (const [dateKey, slotsInGroup] of groups) {
        slotsInGroup.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    }
    
    return new Map([...groups.entries()].sort());
};

// Удаление элемента из корзины
export const removeCartItem = (index) => {
    if (confirm('Удалить этот заказ из корзины?')) {
        const removedItem = state.orderCart[index];
        state.orderCart.splice(index, 1);
        
        if (removedItem.location_id) {
            state.selectedLocations.delete(removedItem.location_id.toString());
            $(`.location-item[data-id="${removedItem.location_id}"]`).removeClass('disabled');
        }
        
        saveCart();
        showNotification(`Заказ для "${removedItem.location_name}" удален`, 'info');
        return true;
    }
    return false;
};

// Загрузка доступного оборудования с учетом дат
export const loadAvailableEquipment = async (locationId, dateStart = null, dateEnd = null, editIndex = null) => {
    try {
        const index = editIndex !== null ? editIndex : currentEditIndex;
        
        if (!dateStart && index !== null) {
            const item = state.orderCart[index];
            if (item && item.type !== 'slots') {
                dateStart = item.date_start;
                dateEnd = item.date_end;
            }
        }
        
        let allEquipment = [];
        
        const locationResponse = await $.ajax({
            url: '/api/equipment-by-location/',
            method: 'GET',
            data: { location_id: locationId, type_ids: [] }
        });
        
        const commonResponse = await $.ajax({
            url: '/api/common-equipment/',
            method: 'GET',
            data: { type_ids: [] }
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
        
        if (dateStart && dateEnd) {
            const availabilityResponse = await api.checkEquipmentAvailability(
                locationId, dateStart, dateEnd, []
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
        
        setAvailableEquipment(allEquipment);
        return allEquipment;
    } catch (error) {
        console.error('Ошибка загрузки оборудования:', error);
        setAvailableEquipment([]);
        return [];
    }
};

// Глобальные функции для доступа из HTML (временно, до полного перехода на модули)
window.removeCartItemGlobal = removeCartItem;
window.formatDateTimeForInput = formatDateTimeForInput;