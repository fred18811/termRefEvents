// static/mainapp/js/modules/cart/index.js

// Экспорт из cartDisplay
export { updateCartDisplay, clearCartGlobal } from './cartDisplay.js';

// Экспорт из cartEdit
export { openEditModal } from './cartEdit.js';

// Экспорт из cartEditSlots
export { openEditSlotsModal, saveEditedSlots } from './cartEditSlots.js';

// Экспорт из cartSave
export { saveSingleOrder, saveEditedOrder } from './cartSave.js';

// Экспорт из cartEquipment
export { addSelectedEquipment, openAddEquipmentModal } from './cartEquipment.js';

// Экспорт из cartSlotEquipment
export { openAddEquipmentForSlot } from './cartSlotEquipment.js';

// Экспорт из cartUtils
export { 
    availableEquipment, 
    setAvailableEquipment,
    currentEditIndex,
    setCurrentEditIndex,
    loadAvailableEquipment,
    removeCartItem
} from './cartUtils.js';

// Инициализация всех обработчиков для корзины
export const initCart = () => {
    console.log('Cart module initialized');
    
    // Привязываем глобальные кнопки
    setTimeout(() => {
        const saveBtn = document.getElementById('saveOrderFromCartBtn');
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            newSaveBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const { saveSingleOrder } = await import('./cartSave.js');
                await saveSingleOrder();
            });
        }
        
        const clearBtn = document.getElementById('clearCartBtn');
        if (clearBtn) {
            const newClearBtn = clearBtn.cloneNode(true);
            clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
            newClearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Очистить всю корзину?')) {
                    const { clearCartGlobal } = require('./cartDisplay.js');
                    clearCartGlobal();
                }
            });
        }
    }, 100);
};

// Для обратной совместимости с существующим кодом
window.saveSingleOrder = () => import('./cartSave.js').then(m => m.saveSingleOrder());
window.saveEditedOrder = () => import('./cartSave.js').then(m => m.saveEditedOrder());
window.addSelectedEquipment = () => import('./cartEquipment.js').then(m => m.addSelectedEquipment());
window.updateCartDisplayGlobal = () => import('./cartDisplay.js').then(m => m.updateCartDisplay());
window.clearCartGlobal = () => import('./cartDisplay.js').then(m => m.clearCartGlobal());