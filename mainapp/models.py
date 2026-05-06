from django.db import models
from django.db.models.signals import post_migrate, pre_save
from django.contrib.auth.models import User, Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.validators import MaxValueValidator, MinValueValidator
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.dispatch import receiver
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


@receiver(pre_save, sender=User)
def set_username_as_email(sender, instance, **kwargs):
    """
    Автоматически устанавливает username = email для обычных пользователей
    Суперпользователи могут иметь свой username
    """
    # Если это не суперпользователь и email указан
    if not instance.is_superuser and instance.email:
        # Устанавливаем username равным email
        instance.username = instance.email
 

class GroupProfile(models.Model):
    """
    Дополнительная информация о группе (комментарий)
    """
    group = models.OneToOneField(
        Group,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='группа'
    )
    comment = models.TextField(
        verbose_name='комментарий',
        blank=True,
        null=True,
        help_text='Дополнительный комментарий к группе'
    )
    created_at = models.DateTimeField(
        verbose_name='дата создания',
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        verbose_name='дата обновления',
        auto_now=True
    )
    
    class Meta:
        db_table = 'mainapp_group_profiles'
        verbose_name = 'профиль группы'
        verbose_name_plural = 'профили групп'
    
    def __str__(self):
        return f"Профиль группы: {self.group.name}"
            

class History(models.Model):
    """
    Модель истории действий пользователей
    """
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        verbose_name='Пользователь',
        related_name='history_entries'
    )
    description = models.TextField(
        verbose_name='Описание действия',
        help_text='Подробное описание действия пользователя'
    )
    datetime = models.DateTimeField(
        verbose_name='Дата и время',
        default=timezone.now,
        db_index=True
    )
    
    class Meta:
        verbose_name = 'Запись истории'
        verbose_name_plural = 'История действий'
        ordering = ['-datetime']  # Сортировка по убыванию даты (сначала новые)
        indexes = [
            models.Index(fields=['user', '-datetime']),
            models.Index(fields=['datetime']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.datetime.strftime('%d.%m.%Y %H:%M')} - {self.description[:50]}"
    
    def get_short_description(self):
        """Возвращает короткую версию описания (первые 100 символов)"""
        return self.description[:100] + '...' if len(self.description) > 100 else self.description
    
    
class Location(models.Model):
    name = models.CharField(
        max_length=100, 
        verbose_name=_('Наименование'),
        unique=True,
        error_messages={
            'unique': _('Помещение с таким названием уже существует')
        }
    )
    size = models.CharField(max_length=50, verbose_name=_('Размер'))
    description = models.TextField(
        verbose_name=_('Описание'),
        blank=True,
        null=True,
        help_text='Подробное описание помещения. Поддерживает HTML теги.'
    )
    
    is_event = models.BooleanField(
        verbose_name=_('мероприятие'),
        default=True,
        help_text='Отметьте, если помещение используется для мероприятий'
    )
    
    class Meta:
        db_table = 'locations'
        verbose_name = _('помещение')
        verbose_name_plural = _('помещения')
    
    def __str__(self):
        return self.name


class TypeEquipment(models.Model):
    name = models.CharField(
        max_length=100, 
        verbose_name=_('Наименование'),
        unique=True,
        error_messages={
            'unique': _('Тип оборудования с таким названием уже существует')
        }
    )
    
    class Meta:
        db_table = 'types_equipments'
        verbose_name = _('тип оборудования')
        verbose_name_plural = _('типы оборудования')
    
    def __str__(self):
        return self.name


class Equipment(models.Model):
    name = models.CharField(
        max_length=100, 
        verbose_name=_('Наименование'),
        unique=True,  # Добавляем уникальность
        error_messages={
            'unique': _('Оборудование с таким названием уже существует')
        }
    )
    
    class Meta:
        db_table = 'equipments'
        verbose_name = _('оборудование')
        verbose_name_plural = _('оборудование')
    
    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        # Приводим к одному регистру для сравнения (опционально)
        if self.name:
            self.name = self.name.strip()
        super().save(*args, **kwargs)


class EquipmentLocation(models.Model):
    id_types_equipments = models.ForeignKey(
        TypeEquipment,
        on_delete=models.CASCADE,
        db_column='id_types_equipments',
        verbose_name=_('тип оборудования')
    )
    id_equipments = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        db_column='id_equipments',
        verbose_name=_('оборудование')
    )
    id_locations = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        db_column='id_locations',
        verbose_name=_('помещение')
    )
    quantity = models.PositiveIntegerField(
        verbose_name='количество',
        default=1,
        validators=[
            MinValueValidator(1, message='Количество должно быть не менее 1'),
            MaxValueValidator(999, message='Количество не может превышать 999 (максимум 3 знака)')
        ],
        help_text='Введите количество от 1 до 999 (максимум 3 знака)'
    )
    
    class Meta:
        db_table = 'equipments_locations'
        verbose_name = _('оборудование в помещении')
        verbose_name_plural = _('оборудование в помещении')
        constraints = [
            models.UniqueConstraint(
                fields=['id_types_equipments', 'id_equipments', 'id_locations'],
                name='unique_equipment_location'
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1) & models.Q(quantity__lte=999),
                name='quantity_range_check'
            )
        ]
    
    def clean(self):
        """Дополнительная валидация с проверкой на None"""
        super().clean()
        # ✅ Добавьте проверку на None
        if self.quantity is None:
            self.quantity = 1  # Значение по умолчанию
        
        if self.quantity < 1:
            raise ValidationError({'quantity': 'Количество не может быть меньше 1'})
        if self.quantity > 999:
            raise ValidationError({'quantity': 'Количество не может превышать 999 (максимум 3 знака)'})
    
    def save(self, *args, **kwargs):
        # ✅ Проверка на None перед сохранением
        if self.quantity is None:
            self.quantity = 1
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.id_types_equipments} - {self.id_equipments} - {self.id_locations}: {self.quantity}"


def validate_jpg(value):
    if not value.name.lower().endswith(('.jpg', '.jpeg')):
        raise ValidationError('Только JPG файлы разрешены')


class CommonEquipmentLocation(models.Model):
    id_types_equipments = models.ForeignKey(
        TypeEquipment,
        on_delete=models.CASCADE,
        db_column='id_types_equipments',
        verbose_name=_('тип оборудования')
    )
    id_equipments = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        db_column='id_equipments',
        verbose_name=_('оборудование')
    )
    quantity = models.PositiveIntegerField(
        verbose_name='количество',
        default=1,
        validators=[
            MinValueValidator(1, message='Количество должно быть не менее 1'),
            MaxValueValidator(999, message='Количество не может превышать 999 (максимум 3 знака)')
        ],
        help_text='Введите количество от 1 до 999 (максимум 3 знака)'
    )
    
    class Meta:
        db_table = 'common_equipments_locations'
        verbose_name = _('общее оборудование')
        verbose_name_plural = _('общее оборудование')
        constraints = [
            models.UniqueConstraint(
                fields=['id_types_equipments', 'id_equipments'],
                name='unique_common_equipment'
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1) & models.Q(quantity__lte=999),
                name='common_quantity_range_check'
            )
        ]
    
    def __str__(self):
        return f"{self.id_types_equipments} - {self.id_equipments}: {self.quantity}"
        

class Photo(models.Model):
    id_location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        db_column='id_location',
        related_name='photos',
        verbose_name=_('помещение')
    )
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=300)
    photo = models.ImageField(
        upload_to='location_photos/',
        validators=[
            FileExtensionValidator(allowed_extensions=['jpg', 'jpeg']),
            validate_jpg
        ],
        verbose_name=_('фотография'),
        help_text=_('Загрузите фото в формате JPG'),
    )
    is_main = models.BooleanField(
        default=False,
        verbose_name=_('главное фото'),
        help_text=_('Отметьте, если это фото должно отображаться как главное для помещения')
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('дата создания'))
    
    class Meta:
        db_table = 'photos'
        verbose_name = _('фотография')
        verbose_name_plural = _('фотографии')
        ordering = ['-is_main', '-created_at']  # Сначала главные, потом по дате
        # Убеждаемся, что для одной локации может быть только одно главное фото
        constraints = [
            models.UniqueConstraint(
                fields=['id_location'],
                condition=models.Q(is_main=True),
                name='unique_main_photo_per_location'
            )
        ]
    
    def save(self, *args, **kwargs):
        # Если это фото помечено как главное, снимаем флаг is_main с других фото этой локации
        if self.is_main:
            Photo.objects.filter(id_location=self.id_location, is_main=True).exclude(id=self.id).update(is_main=False)
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.name} - {self.id_location} ({'Главное' if self.is_main else 'Обычное'})"


class Application(models.Model):
    """Модель заявки"""
    name = models.TextField(
        verbose_name=_('название заявки'),
        help_text='Введите название заявки'
    )
    created_at = models.DateTimeField(
        verbose_name=_('дата создания'),
        auto_now_add=True,
        help_text='Дата и время создания заявки'
    )

    id_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='id_user',
        verbose_name=_('пользователь'),
        related_name='applications'
    )

    comment = models.TextField(
        verbose_name=_('комментарий'),
        blank=True,
        null=True,
        help_text='Дополнительный комментарий к заявке'
    )
    status = models.CharField(
        max_length=50,
        verbose_name=_('статус'),
        default='new',
        choices=[
            ('new', 'Новая'),
            ('in_progress', 'В работе'),
            ('completed', 'Завершена'),
            ('cancelled', 'Отменена'),
        ]
    )
    
    date_start = models.DateTimeField(
        verbose_name=_('дата начала заявки'),
        blank=True,
        null=True,
        help_text='Дата и время начала заявки'
    )
    date_end = models.DateTimeField(
        verbose_name=_('дата окончания заявки'),
        blank=True,
        null=True,
        help_text='Дата и время окончания заявки'
    )
    
    class Meta:
        db_table = 'applications'
        verbose_name = _('заявка')
        verbose_name_plural = _('заявки')
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Заявка №{self.id} - {self.name[:50]}"
    
        
class Order(models.Model):
    id_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='id_user',
        verbose_name=_('пользователь'),
        null=True,
        blank=True,
        help_text='Пользователь, создавший заказ'
    )
    id_location = models.ForeignKey(
        Location,
        on_delete=models.CASCADE,
        db_column='id_location',
        verbose_name=_('помещение'),
        null=True,
        blank=True,
        help_text='Выберите помещение (если заказ привязан к конкретному помещению)'
    )

    id_application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        db_column='id_application',
        verbose_name=_('заявка'),
        null=True,
        blank=True
    )
    
    date_time_start = models.DateTimeField(
        verbose_name='дата и время начала',
        default=timezone.now,
        help_text='Дата и время начала заказа'
    )
    date_time_end = models.DateTimeField(
        verbose_name='дата и время окончания',
        blank=True,
        null=True,
        help_text='Дата и время окончания заказа (оставьте пустым, если заказ активен)'
    )
    comment = models.TextField(
        verbose_name=_('комментарий'),
        blank=True,
        null=True,
        help_text='Дополнительная информация к заказу'
    )
    
    class Meta:
        db_table = 'orders'
        verbose_name = 'аренда зала'
        verbose_name_plural = 'аренда залов'
        ordering = ['-date_time_start']
    
    def __str__(self):
        user_name = f" - {self.id_user.username}" if self.id_user else ""
        location_name = f" - {self.id_location.name}" if self.id_location else ""
        return f"Заказ №{self.id}{user_name}{location_name} от {self.date_time_start.strftime('%d.%m.%Y %H:%M')}"
    
    @property
    def is_active(self):
        """Проверяет, активен ли заказ"""
        return self.date_time_end is None
    
    @property
    def total_items(self):
        """Общее количество позиций в заказе"""
        return self.order_items.count()
    
    @property
    def total_quantity(self):
        """Общее количество единиц оборудования в заказе"""
        return sum(item.quantity for item in self.order_items.all())


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='order_items',
        verbose_name='заказ'
    )
    equipment_location = models.ForeignKey(
        EquipmentLocation,
        on_delete=models.CASCADE,
        verbose_name='оборудование в локации',
        null=True,
        blank=True,
        help_text='Выберите оборудование из конкретной локации'
    )
    common_equipment_location = models.ForeignKey(
        CommonEquipmentLocation,
        on_delete=models.CASCADE,
        verbose_name='общее оборудование',
        null=True,
        blank=True,
        help_text='Выберите общее оборудование (не привязанное к локации)'
    )
    quantity = models.PositiveIntegerField(
        verbose_name='количество',
        validators=[
            MinValueValidator(1, message='Количество должно быть не менее 1'),
            MaxValueValidator(999, message='Количество не может превышать 999')
        ],
        help_text='Введите количество от 1 до 999 (максимум 3 знака)'
    )
    can_provide = models.IntegerField(
        verbose_name=_('можем предоставить'),
        default=0,
        validators=[
            MinValueValidator(0, message='Значение не может быть меньше 0')
        ],
        help_text='Количество оборудования, которое может предоставить подразделение (0 - не может предоставить)'
    )
    is_agreed = models.BooleanField(
        verbose_name=_('согласовано'),
        default=False,
        help_text='Отметьте, если позиция согласована'
    )
    
    class Meta:
        db_table = 'order_items'
        verbose_name = 'позиция заказа'
        verbose_name_plural = 'позиции заказов'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gte=1) & models.Q(quantity__lte=999),
                name='order_item_quantity_range_check'
            ),
            models.CheckConstraint(
                condition=models.Q(can_provide__gte=0),
                name='order_item_can_provide_range_check'
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(equipment_location__isnull=False, common_equipment_location__isnull=True) |
                    models.Q(equipment_location__isnull=True, common_equipment_location__isnull=False)
                ),
                name='one_of_equipment_locations_required'
            )
        ]
    
    def clean(self):
        """Проверка, что количество не превышает доступное и заполнено одно из полей"""
        super().clean()
        
        # Проверка: должно быть заполнено либо equipment_location, либо common_equipment_location
        if not self.equipment_location and not self.common_equipment_location:
            raise ValidationError('Необходимо выбрать либо оборудование из локации, либо общее оборудование')
        
        if self.equipment_location and self.common_equipment_location:
            raise ValidationError('Выберите только один тип оборудования: либо из локации, либо общее')
        
        # Проверка количества для equipment_location
        if self.quantity and self.equipment_location:
            if self.quantity > self.equipment_location.quantity:
                raise ValidationError({
                    'quantity': f'Запрошенное количество ({self.quantity}) превышает доступное ({self.equipment_location.quantity})'
                })
        
        # Проверка количества для common_equipment_location
        if self.quantity and self.common_equipment_location:
            if self.quantity > self.common_equipment_location.quantity:
                raise ValidationError({
                    'quantity': f'Запрошенное количество ({self.quantity}) превышает доступное ({self.common_equipment_location.quantity})'
                })
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        if self.equipment_location:
            return f"{self.order} - {self.equipment_location} x{self.quantity}"
        else:
            return f"{self.order} - {self.common_equipment_location} x{self.quantity}"
    
    @property
    def get_equipment_name(self):
        """Получить название оборудования"""
        if self.equipment_location:
            return self.equipment_location.id_equipments.name
        elif self.common_equipment_location:
            return self.common_equipment_location.id_equipments.name
        return "Не указано"
    
    @property
    def get_location_name(self):
        """Получить название локации (если есть)"""
        if self.equipment_location:
            return self.equipment_location.id_locations.name
        return "Общее оборудование"
    
    @property
    def get_type_name(self):
        """Получить тип оборудования"""
        if self.equipment_location:
            return self.equipment_location.id_types_equipments.name
        elif self.common_equipment_location:
            return self.common_equipment_location.id_types_equipments.name
        return "Не указано"


class Feedback(models.Model):
    """
    Модель для обратной связи пользователей по заявкам
    """
    id_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='id_user',
        verbose_name=_('пользователь'),
        related_name='feedback_entries'
    )
    id_application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        db_column='id_application',
        verbose_name=_('заявка'),
        related_name='feedback_entries',
        null=True,
        blank=True,
        help_text='Заявка, к которой оставлен отзыв (может быть не указана для общего отзыва)'
    )
    name = models.CharField(
        max_length=300,
        verbose_name=_('название'),
        blank=True,
        null=True,
        help_text='Название отзыва/заголовок (необязательно)'
    )
    comment = models.TextField(
        verbose_name=_('комментарий'),
        help_text='Текст обратной связи/комментария'
    )
    created_at = models.DateTimeField(
        verbose_name=_('дата создания'),
        auto_now_add=True,
        help_text='Дата и время создания отзыва'
    )
    
    class Meta:
        db_table = 'feedback'
        verbose_name = _('обратная связь')
        verbose_name_plural = _('обратная связь')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['id_user', '-created_at']),
            models.Index(fields=['id_application']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        if self.id_application:
            return f"Feedback #{self.id} - {self.id_user.username} - Заявка #{self.id_application.id}"
        return f"Feedback #{self.id} - {self.id_user.username} - Общий отзыв"
    
    def get_short_comment(self):
        """Возвращает короткую версию комментария (первые 100 символов)"""
        return self.comment[:100] + '...' if len(self.comment) > 100 else self.comment
    get_short_comment.short_description = 'Комментарий (кратко)'
    
    def get_short_name(self):
        """Возвращает короткую версию названия (первые 50 символов)"""
        if self.name:
            return self.name[:50] + '...' if len(self.name) > 50 else self.name
        return '—'
    get_short_name.short_description = 'Название'
    
    
@receiver(post_migrate)
def create_default_groups_and_permissions(sender, **kwargs):
    """Создание групп и прав по умолчанию после миграции"""
    if sender.name == 'mainapp':
        from .models import Application, Department, GroupProfile
        
        # Создаем группы
        view_group, _ = Group.objects.get_or_create(name='ViewApplications')
        edit_group, _ = Group.objects.get_or_create(name='EditApplications')
        mail_group, _ = Group.objects.get_or_create(name='MailReciver')
        
        # Создаем профили для групп с комментариями
        for group in [view_group, edit_group, mail_group]:
            profile, created = GroupProfile.objects.get_or_create(group=group)
            if created:
                if group.name == 'ViewApplications':
                    profile.comment = 'Группа для просмотра всех заявок (без возможности редактирования)'
                elif group.name == 'EditApplications':
                    profile.comment = 'Группа для просмотра и редактирования всех заявок'
                elif group.name == 'MailReciver':
                    profile.comment = 'Группа для получения email уведомлений о новых заявках и обращениях'
                profile.save()
        
        # Создаем права
        from .models import Application, Department
        
        app_content_type = ContentType.objects.get_for_model(Application)
        dept_content_type = ContentType.objects.get_for_model(Department)
        
        view_perm, _ = Permission.objects.get_or_create(
            codename='view_all_applications',
            name='Can view all applications',
            content_type=app_content_type
        )
        
        edit_perm, _ = Permission.objects.get_or_create(
            codename='edit_all_applications',
            name='Can edit all applications',
            content_type=app_content_type
        )
        
        view_dept_perm, _ = Permission.objects.get_or_create(
            codename='view_department',
            name='Can view department',
            content_type=dept_content_type
        )
        
        change_dept_perm, _ = Permission.objects.get_or_create(
            codename='change_department',
            name='Can change department',
            content_type=dept_content_type
        )
        
        view_group.permissions.add(view_perm, view_dept_perm)
        edit_group.permissions.add(view_perm, edit_perm, view_dept_perm, change_dept_perm)
        
        print(f"Группы созданы: ViewApplications, EditApplications, MailReciver")
        print(f"Права назначены: {view_group.permissions.count()} для ViewApplications, {edit_group.permissions.count()} для EditApplications")
                
        
@receiver(post_migrate)
def create_mail_receiver_group(sender, **kwargs):
    """Создание группы MailReciver после миграции"""
    if sender.name == 'mainapp':
        group, created = Group.objects.get_or_create(name='MailReciver')
        if created:
            print(f'Группа "{group.name}" создана')
            
            
class Department(models.Model):
    """
    Модель подразделения (без привязки к пользователю)
    """
    name = models.CharField(
        max_length=255,
        verbose_name=_('название подразделения'),
        unique=True,
        help_text='Название подразделения (например, "Отдел продаж", "IT-отдел")'
    )
    description = models.TextField(
        verbose_name=_('описание'),
        blank=True,
        null=True,
        help_text='Дополнительное описание подразделения'
    )
    created_at = models.DateTimeField(
        verbose_name=_('дата создания'),
        auto_now_add=True,
        help_text='Дата и время создания записи'
    )
    updated_at = models.DateTimeField(
        verbose_name=_('дата обновления'),
        auto_now=True,
        help_text='Дата и время последнего обновления'
    )
    
    is_approval_required = models.BooleanField(
        verbose_name=_('Согласование'),
        default=False,
        help_text='Отметьте, если данное подразделение учавствует в согласовании заявок'
    )
    
    class Meta:
        db_table = 'departments'
        verbose_name = _('подразделение')
        verbose_name_plural = _('подразделения')
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return self.name

    
class UserDepartment(models.Model):
    """
    Модель связи пользователя с подразделением (многие-ко-многим)
    """
    id_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='id_user',
        verbose_name=_('пользователь'),
        related_name='user_departments',
        help_text='Пользователь'
    )
    id_department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        db_column='id_department',
        verbose_name=_('подразделение'),
        related_name='department_users',
        help_text='Подразделение'
    )
    is_head = models.BooleanField(
        verbose_name=_('руководитель'),
        default=False,
        help_text='Является ли пользователь руководителем подразделения'
    )
    created_at = models.DateTimeField(
        verbose_name=_('дата создания'),
        auto_now_add=True,
        help_text='Дата и время создания связи'
    )
    
    class Meta:
        db_table = 'user_departments'
        verbose_name = _('связь пользователя с подразделением')
        verbose_name_plural = _('связи пользователей с подразделениями')
        ordering = ['id_department', 'id_user']
        indexes = [
            models.Index(fields=['id_user']),
            models.Index(fields=['id_department']),
        ]
        unique_together = [['id_user', 'id_department']]  # Один пользователь может быть в подразделении только один раз
    
    def __str__(self):
        return f"{self.id_user.username} → {self.id_department.name}"


class DepartmentTypeEquipment(models.Model):
    """
    Модель связи подразделения с типом оборудования
    """
    id_department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        db_column='id_department',
        verbose_name=_('подразделение'),
        related_name='department_type_equipment',
        help_text='Подразделение'
    )
    id_type_equipment = models.ForeignKey(
        TypeEquipment,
        on_delete=models.CASCADE,
        db_column='id_type_equipment',
        verbose_name=_('тип оборудования'),
        related_name='department_type_equipment',
        help_text='Тип оборудования'
    )
    created_at = models.DateTimeField(
        verbose_name=_('дата создания'),
        auto_now_add=True,
        help_text='Дата и время создания связи'
    )
    
    class Meta:
        db_table = 'departments_types_equipment'
        verbose_name = _('связь подразделения с типом оборудования')
        verbose_name_plural = _('связи подразделений с типами оборудования')
        ordering = ['id_department', 'id_type_equipment']
        indexes = [
            models.Index(fields=['id_department']),
            models.Index(fields=['id_type_equipment']),
        ]
        unique_together = [['id_department', 'id_type_equipment']]  # Уникальная связь
    
    def __str__(self):
        return f"{self.id_department.name} → {self.id_type_equipment.name}"
    

class ApplicationApproval(models.Model):
    """
    Модель списка согласования заявок
    """
    id_department = models.ForeignKey(
        Department,
        on_delete=models.CASCADE,
        db_column='id_department',
        verbose_name=_('подразделение'),
        related_name='application_approvals',
        help_text='Подразделение, которое согласовывает заявку'
    )
    id_application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        db_column='id_application',
        verbose_name=_('заявка'),
        related_name='approvals',
        help_text='Заявка на согласование'
    )
    id_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='id_user',
        verbose_name=_('пользователь'),
        related_name='application_approvals',
        null=True,
        blank=True,
        help_text='Пользователь, который согласовал заявку'
    )
    is_agreed = models.BooleanField(
        verbose_name=_('согласовано'),
        default=False,
        help_text='Статус согласования заявки подразделением'
    )
    date_agreed = models.DateTimeField(
        verbose_name=_('дата согласования'),
        blank=True,
        null=True,
        help_text='Дата и время согласования (заполняется автоматически при is_agreed=True)'
    )
    comment = models.TextField(
        verbose_name=_('комментарий'),
        blank=True,
        null=True,
        help_text='Комментарий к согласованию'
    )
    created_at = models.DateTimeField(
        verbose_name=_('дата создания'),
        auto_now_add=True,
        help_text='Дата и время создания записи'
    )
    updated_at = models.DateTimeField(
        verbose_name=_('дата обновления'),
        auto_now=True,
        help_text='Дата и время последнего обновления'
    )
    
    class Meta:
        db_table = 'application_approvals'
        verbose_name = _('согласование заявки')
        verbose_name_plural = _('согласование заявок')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['id_department']),
            models.Index(fields=['id_application']),
            models.Index(fields=['id_user']),
            models.Index(fields=['is_agreed']),
            models.Index(fields=['date_agreed']),
        ]
        unique_together = [['id_department', 'id_application']]  # Одно подразделение может согласовать заявку только один раз
    
    def __str__(self):
        status = "Согласовано" if self.is_agreed else "Не согласовано"
        user_info = f" (пользователь: {self.id_user.username})" if self.id_user else ""
        return f"{self.id_department.name} - Заявка #{self.id_application.id} ({status}){user_info}"
    
    def save(self, *args, **kwargs):
        # Если is_agreed изменилось на True, устанавливаем дату согласования
        if self.is_agreed and not self.date_agreed:
            self.date_agreed = timezone.now()
        # Если is_agreed стало False, сбрасываем дату согласования
        elif not self.is_agreed and self.date_agreed:
            self.date_agreed = None
        super().save(*args, **kwargs)