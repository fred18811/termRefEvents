import { escapeHtml } from './utils.js';

// Показ модального окна подтверждения
export const showConfirm = (message, onConfirm) => {
    $('#confirmMessage').text(message);
    $('#confirmModal').css('display', 'flex');
    
    $('#confirmYes').off('click').one('click', () => {
        $('#confirmModal').hide();
        if (onConfirm) onConfirm();
    });
    
    $('#confirmNo, #confirmModal .modal-close').off('click').one('click', () => {
        $('#confirmModal').hide();
    });
};

// Показ модального окна с деталями помещения
export const showRoomModal = (room) => {
    let eqHtml = '<h4><i class="fa fa-file-text-o" aria-hidden="true"></i> Оборудование:</h4><ul class="equipment-list-modal">';
    
    if (room.equipment?.length) {
        room.equipment.forEach(e => {
            eqHtml += `<li>
                <span>${escapeHtml(e.name)}</span>
                <span class="equipment-quantity-modal">${e.quantity} шт.</span>
            </li>`;
        });
    } else {
        eqHtml += '<li>Нет оборудования</li>';
    }
    eqHtml += '</ul>';
    
    $('#roomModalTitle').text(`🏢 ${escapeHtml(room.name)}`);
    $('#roomModalContent').html(`
        <img src="${room.photo_url || '/static/mainapp/images/default-room.jpg'}" 
             class="room-modal-image" 
             onerror="this.src='/static/mainapp/images/default-room.jpg'">
        <div class="room-modal-info">
            <p><strong>📐 Размер:</strong> ${escapeHtml(room.size)}</p>
            <p><strong>📝 Описание:</strong> ${escapeHtml(room.description)}</p>
            <p><strong>📦 Оборудования:</strong> ${room.equipment_count} позиций</p>
            <p><strong>🔧 Всего:</strong> ${room.total_quantity} шт.</p>
        </div>
        ${eqHtml}
    `);
    
    $('#roomModal').show();
};

// Закрытие всех модальных окон
export const closeModals = () => {
    $('.modal').hide();
};