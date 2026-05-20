"""Вспомогательные функции для views.py"""

def user_can_view_all_applications(user):
    """Проверка, может ли пользователь видеть все заявки"""
    return user.is_superuser or user.groups.filter(name='ViewApplications').exists() or user.groups.filter(name='EditApplications').exists()

def user_can_edit_all_applications(user):
    """Проверка, может ли пользователь редактировать все заявки"""
    return user.is_superuser or user.groups.filter(name='EditApplications').exists()

def get_user_permissions(user):
    """Получить все права пользователя в удобном формате"""
    return {
        'can_view_all': user_can_view_all_applications(user),
        'can_edit_all': user_can_edit_all_applications(user),
        'is_superuser': user.is_superuser,
        'groups': list(user.groups.values_list('name', flat=True))
    }