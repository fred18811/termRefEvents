# mainapp/management/commands/create_groups.py

from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from mainapp.models import Order, EquipmentLocation, Location

class Command(BaseCommand):
    help = 'Создание групп доступа и назначение прав'
    
    def handle(self, *args, **options):
        # Создаем группы
        groups = {
            'Admin': ['view', 'add', 'change', 'delete'],
            'Manager': ['view', 'add', 'change'],
            'User': ['view']
        }
        
        # Модели для которых создаем права
        models = [Order, EquipmentLocation, Location]
        
        for group_name, permissions in groups.items():
            group, created = Group.objects.get_or_create(name=group_name)
            
            for model in models:
                content_type = ContentType.objects.get_for_model(model)
                
                for perm in permissions:
                    permission_name = f"{perm}_{model._meta.model_name}"
                    try:
                        permission = Permission.objects.get(
                            codename=permission_name,
                            content_type=content_type
                        )
                        group.permissions.add(permission)
                        self.stdout.write(f"Добавлено право {permission_name} для группы {group_name}")
                    except Permission.DoesNotExist:
                        self.stdout.write(f"Право {permission_name} не найдено")
            
            self.stdout.write(self.style.SUCCESS(f'Группа {group_name} создана/обновлена'))