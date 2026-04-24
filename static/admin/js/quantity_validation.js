(function($) {
    'use strict';
    
    $(document).ready(function() {
        // Находим поле quantity
        var quantityField = $('input[name="quantity"]');
        
        if (quantityField.length) {
            // Добавляем обработчик ввода
            quantityField.on('input', function() {
                var value = parseInt($(this).val());
                var errorSpan = $('#quantity_error');
                
                // Удаляем старую ошибку
                if (errorSpan.length) {
                    errorSpan.remove();
                }
                
                // Проверяем значение
                if (isNaN(value)) {
                    showError($(this), 'Пожалуйста, введите число');
                } else if (value < 1) {
                    showError($(this), 'Количество не может быть меньше 1');
                } else if (value > 999) {
                    showError($(this), 'Количество не может превышать 999 (максимум 3 знака)');
                } else if ($(this).val().length > 3) {
                    showError($(this), 'Количество не может содержать более 3 знаков');
                } else {
                    // Убираем ошибку если всё правильно
                    $(this).css('border-color', '');
                }
            });
            
            // Добавляем обработчик перед отправкой формы
            $('form').on('submit', function(e) {
                var quantity = parseInt(quantityField.val());
                
                if (isNaN(quantity) || quantity < 1 || quantity > 999) {
                    e.preventDefault();
                    showError(quantityField, 'Пожалуйста, исправьте ошибки в поле "Количество"');
                    return false;
                }
            });
        }
        
        function showError(field, message) {
            field.css('border-color', '#ba2121');
            
            // Удаляем существующую ошибку
            $('#quantity_error').remove();
            
            // Добавляем новую ошибку
            var errorHtml = '<ul class="errorlist" id="quantity_error"><li>' + message + '</li></ul>';
            field.parent().prepend(errorHtml);
        }
    });
})(django.jQuery);