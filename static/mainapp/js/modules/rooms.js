'use strict';

import { state } from './state.js';
import { escapeHtml, showNotification } from './utils.js';
import { api } from './api.js';

// Константы для сортировки
const SORT_OPTIONS = {
    NAME: 'name',
    SIZE: 'size'
};

// Загрузка помещений
export const loadRooms = async () => {
    const container = $('#roomsContainer');
    container.html('<div class="loading">🏢 Загрузка помещений...</div>');
    
    try {
        const res = await api.getRooms();
        if (res.success) {
            state.currentRooms = res.rooms;
            displayRooms(res.rooms);
        } else {
            container.html(`<div class="no-rooms">❌ ${escapeHtml(res.error)}</div>`);
        }
    } catch (error) {
        console.error('Ошибка загрузки помещений:', error);
        container.html('<div class="no-rooms">❌ Ошибка загрузки. Проверьте соединение.</div>');
    }
};

// Отображение карточек помещений
export const displayRooms = (rooms) => {
    if (!rooms?.length) {
        $('#roomsContainer').html('<div class="no-rooms">🏢 Нет доступных помещений</div>');
        return;
    }
    
    let html = '<div class="rooms-grid">';
    
    rooms.forEach(room => {
        const photoUrl = room.photo_url || '/static/mainapp/images/default-room.jpg';
        const equipmentCount = room.equipment_count || 0;
        const totalQuantity = room.total_quantity || 0;
        
        html += `
            <div class="room-card" data-id="${room.id}" onclick="window.location.href='/room/${room.id}/'">
                <img src="${photoUrl}" 
                     class="room-image" 
                     alt="${escapeHtml(room.name)}"
                     loading="lazy"
                     onerror="this.src='/static/mainapp/images/default-room.jpg'">
                <div class="room-overlay">
                    <div class="room-title">${escapeHtml(room.name)}</div>
                    <div class="room-size"><i class="fa fa-map-o" aria-hidden="true"></i> ${escapeHtml(room.size)}</div>
                    <div>
                        <span class="room-badge"><i class="fa fa-archive" aria-hidden="true"></i> ${equipmentCount}</span>
                        <span class="room-badge"><i class="fa fa-wrench" aria-hidden="true"></i> ${totalQuantity} шт.</span>
                    </div>
                </div>
            </div>`;
    });
    
    html += '</div>';
    $('#roomsContainer').html(html);
};

// Показать детали помещения
export const showRoomDetails = (roomId) => {
    if (roomId) {
        window.location.href = `/room/${roomId}/`;
    }
};

// Фильтрация и сортировка помещений
export const filterRooms = () => {
    if (!state.currentRooms?.length) return;
    
    let filtered = [...state.currentRooms];
    const search = $('#searchRooms').val().toLowerCase().trim();
    
    if (search) {
        filtered = filtered.filter(r =>
            r.name.toLowerCase().includes(search) ||
            (r.description && r.description.toLowerCase().includes(search))
        );
    }
    
    const sort = $('#sortRooms').val();
    
    switch (sort) {
        case SORT_OPTIONS.NAME:
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case SORT_OPTIONS.SIZE:
            filtered.sort((a, b) => (parseInt(a.size) || 0) - (parseInt(b.size) || 0));
            break;
        default:
            // Без сортировки, оставляем как есть
            break;
    }
    
    displayRooms(filtered);
    
    // Обновляем счетчик результатов
    const resultCount = filtered.length;
    $('#roomsCount').text(`Найдено: ${resultCount}`);
};