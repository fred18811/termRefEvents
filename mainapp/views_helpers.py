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
    
def update_application_approvals_for_types(application, equipment_types):
    """
    Обновляет согласования для заявки на основе типов оборудования
    """
    from .models import ApplicationApproval, Department, DepartmentTypeEquipment
    
    if not equipment_types:
        # Если нет типов оборудования, удаляем все согласования
        ApplicationApproval.objects.filter(id_application=application).delete()
        return 0
    
    # Получаем подразделения, которые должны согласовывать
    required_departments = Department.objects.filter(
        is_approval_required=True
    ).filter(
        department_type_equipment__id_type_equipment__id__in=equipment_types
    ).distinct()
    
    required_dept_ids = set(required_departments.values_list('id', flat=True))
    
    # Получаем текущие согласования
    current_approvals = ApplicationApproval.objects.filter(id_application=application)
    current_dept_ids = set(current_approvals.values_list('id_department_id', flat=True))
    
    # Добавляем новые
    added_count = 0
    for dept_id in required_dept_ids - current_dept_ids:
        ApplicationApproval.objects.create(
            id_department_id=dept_id,
            id_application=application,
            is_agreed=False,
            comment='Автоматически добавлено при обновлении заказа'
        )
        added_count += 1
    
    # Удаляем лишние
    removed_count = 0
    for dept_id in current_dept_ids - required_dept_ids:
        ApplicationApproval.objects.filter(
            id_department_id=dept_id,
            id_application=application
        ).delete()
        removed_count += 1
    
    # Если были добавлены или удалены, сбрасываем статус заявки обратно на 'new'
    if added_count > 0 or removed_count > 0:
        if application.status in ['in_progress', 'completed']:
            application.status = 'new'
            application.save(update_fields=['status'])
    
    return added_count