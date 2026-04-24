from .models import History
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

class HistoryService:
    """Сервис для работы с историей действий"""
    
    @staticmethod
    def add_entry(user, description):
        """
        Добавляет запись в историю
        
        Args:
            user: Пользователь (User объект или request.user)
            description: Текстовое описание действия
        
        Returns:
            History: Созданная запись или None при ошибке
        """
        if not user or not user.is_authenticated:
            logger.warning(f"Попытка добавить запись истории без авторизованного пользователя: {description}")
            return None
        
        try:
            entry = History.objects.create(
                user=user,
                description=description,
                datetime=timezone.now()
            )
            logger.info(f"Запись истории добавлена: {user.username} - {description[:50]}")
            return entry
        except Exception as e:
            logger.error(f"Ошибка при добавлении записи истории: {e}")
            return None
    
    @staticmethod
    def get_user_history(user, limit=100, offset=0):
        """
        Получает историю конкретного пользователя
        
        Args:
            user: Пользователь
            limit: Максимальное количество записей
            offset: Смещение для пагинации
        
        Returns:
            QuerySet: Записи истории пользователя
        """
        return History.objects.filter(user=user)[offset:offset+limit]
    
    @staticmethod
    def get_all_history(limit=100, offset=0):
        """Получает все записи истории (для администраторов)"""
        return History.objects.all()[offset:offset+limit]
    
    @staticmethod
    def get_history_by_date_range(start_date, end_date, user=None):
        """
        Получает записи истории за период
        
        Args:
            start_date: Начальная дата
            end_date: Конечная дата
            user: Опционально - фильтр по пользователю
        """
        queryset = History.objects.filter(datetime__range=[start_date, end_date])
        if user:
            queryset = queryset.filter(user=user)
        return queryset
    
    @staticmethod
    def delete_old_entries(days=30):
        """
        Удаляет старые записи (старше указанного количества дней)
        
        Args:
            days: Количество дней (по умолчанию 30)
        
        Returns:
            int: Количество удаленных записей
        """
        cutoff_date = timezone.now() - timezone.timedelta(days=days)
        deleted_count, _ = History.objects.filter(datetime__lt=cutoff_date).delete()
        logger.info(f"Удалено {deleted_count} старых записей истории (старше {days} дней)")
        return deleted_count


# Декоратор для автоматического логирования действий
def log_action(description_template):
    """
    Декоратор для автоматического логирования действий в API
    
    Использование:
    @log_action("Пользователь {user} создал заказ #{order_id}")
    def create_order(request, ...):
        ...
    
    В description_template можно использовать:
    - {user} - имя пользователя
    - {user_id} - ID пользователя
    - Другие переменные из аргументов функции
    """
    def decorator(func):
        def wrapper(request, *args, **kwargs):
            # Выполняем функцию
            response = func(request, *args, **kwargs)
            
            # Формируем описание
            try:
                context = {
                    'user': request.user.username if request.user.is_authenticated else 'Anonymous',
                    'user_id': request.user.id if request.user.is_authenticated else None,
                    **kwargs
                }
                description = description_template.format(**context)
                
                # Добавляем запись в историю
                if request.user.is_authenticated:
                    HistoryService.add_entry(request.user, description)
            except Exception as e:
                logger.error(f"Ошибка при логировании действия: {e}")
            
            return response
        return wrapper
    return decorator