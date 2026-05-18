from django.contrib import admin
from django.contrib.auth.admin import UserAdmin, GroupAdmin as BaseGroupAdmin
from django.contrib.auth.models import User, Group
from django.contrib.auth.models import Group as BaseGroup
from django import forms
from django.utils.html import escape, format_html
from django.utils.safestring import mark_safe
from django.core.exceptions import ValidationError
from django.db import models
from .models import Location, TypeEquipment, Equipment, EquipmentLocation, Photo,\
    Order, OrderItem, CommonEquipmentLocation, Application, History,Feedback,\
        Department, UserDepartment, DepartmentTypeEquipment, ApplicationApproval, GroupProfile  

# Настройка заголовков админ-панели
admin.site.site_header = "Управление локациями и оборудованием"
admin.site.site_title = "Система учета оборудования"
admin.site.index_title = "Добро пожаловать в систему управления"

# Разрегистрируем стандартный UserAdmin
admin.site.unregister(User)
admin.site.unregister(Group)

class GroupProfileInline(admin.StackedInline):
    """Inline для отображения профиля группы"""
    model = GroupProfile
    can_delete = False
    verbose_name_plural = 'Дополнительная информация'
    fields = ['comment']
    extra = 0
    
    
class ApplicationApprovalInline(admin.TabularInline):
    """Inline для отображения согласований в заявке"""
    model = ApplicationApproval
    extra = 1
    fields = ['id_department', 'id_user', 'is_agreed', 'date_agreed', 'comment']
    readonly_fields = ['date_agreed']
    autocomplete_fields = ['id_department', 'id_user']
    verbose_name = 'Согласование'
    verbose_name_plural = 'Согласования'
    
    
class DepartmentTypeEquipmentInline(admin.TabularInline):
    """Inline для отображения типов оборудования в подразделении"""
    model = DepartmentTypeEquipment
    extra = 1
    fields = ['id_type_equipment']
    autocomplete_fields = ['id_type_equipment']
    verbose_name = 'Тип оборудования'
    verbose_name_plural = 'Типы оборудования'
    
    
class UserDepartmentInline(admin.TabularInline):
    """Inline для отображения пользователей в подразделении"""
    model = UserDepartment
    extra = 1
    fields = ['id_department', 'is_head']  # Поля для выбора подразделения
    autocomplete_fields = ['id_department']  # Автодополнение при поиске
    verbose_name = 'Подразделение'
    verbose_name_plural = 'Подразделения'
    
    
class EquipmentForm(forms.ModelForm):
    class Meta:
        model = Equipment
        fields = '__all__'
    
    def clean_name(self):
        name = self.cleaned_data.get('name')
        if name:
            name = name.strip()
            # Проверяем уникальность (случай, когда имя уже существует)
            if Equipment.objects.filter(name__iexact=name).exclude(pk=self.instance.pk).exists():
                raise ValidationError('Оборудование с таким названием уже существует')
        return name
    
    
# ========== Форма для OrderItem с валидацией ==========
class OrderItemForm(forms.ModelForm):
    class Meta:
        model = OrderItem
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Добавляем подсказки
        self.fields['equipment_location'].help_text = 'Выберите оборудование из конкретной локации'
        self.fields['common_equipment_location'].help_text = 'Выберите общее оборудование (не привязанное к локации)'
        self.fields['quantity'].help_text = 'Введите количество от 1 до 999'
        self.fields['can_provide'].help_text = 'Введите количество, которое может предоставить подразделение (0 - не может)'
        self.fields['is_agreed'].help_text = 'Отметьте, если позиция согласована'
        self.fields['is_slot'].help_text = 'Отметьте, если это позиция слота'
        self.fields['slot_date_start'].help_text = 'Дата и время начала слота'
        self.fields['slot_date_start'].widget = forms.DateTimeInput(attrs={'type': 'datetime-local'})
        self.fields['slot_date_end'].help_text = 'Дата и время окончания слота'
        self.fields['slot_date_end'].widget = forms.DateTimeInput(attrs={'type': 'datetime-local'})
    
    def clean(self):
        cleaned_data = super().clean()
        equipment_location = cleaned_data.get('equipment_location')
        common_equipment_location = cleaned_data.get('common_equipment_location')
        quantity = cleaned_data.get('quantity')
        can_provide = cleaned_data.get('can_provide')
        is_slot = cleaned_data.get('is_slot')
        slot_date_start = cleaned_data.get('slot_date_start')
        slot_date_end = cleaned_data.get('slot_date_end')
        
        # Проверка: должно быть заполнено одно из полей
        if not equipment_location and not common_equipment_location:
            raise forms.ValidationError('Необходимо выбрать либо оборудование из локации, либо общее оборудование')
        
        if equipment_location and common_equipment_location:
            raise forms.ValidationError('Выберите только один тип оборудования')
        
        # Проверка количества
        if equipment_location and quantity:
            if quantity > equipment_location.quantity:
                raise forms.ValidationError(
                    f'Недостаточно оборудования! Доступно только {equipment_location.quantity} шт.'
                )
        
        if common_equipment_location and quantity:
            if quantity > common_equipment_location.quantity:
                raise forms.ValidationError(
                    f'Недостаточно общего оборудования! Доступно только {common_equipment_location.quantity} шт.'
                )
        
        # Проверка can_provide (не может быть больше quantity)
        if can_provide and quantity and can_provide > quantity:
            raise forms.ValidationError({
                'can_provide': f'Количество для предоставления ({can_provide}) не может превышать запрошенное количество ({quantity})'
            })
        
        # Проверка полей слота
        if is_slot:
            if not slot_date_start:
                raise forms.ValidationError({
                    'slot_date_start': 'Для слота необходимо указать дату начала'
                })
            if not slot_date_end:
                raise forms.ValidationError({
                    'slot_date_end': 'Для слота необходимо указать дату окончания'
                })
            if slot_date_start and slot_date_end and slot_date_end <= slot_date_start:
                raise forms.ValidationError({
                    'slot_date_end': 'Дата окончания слота должна быть позже даты начала'
                })
        
        return cleaned_data


# ========== Inline для OrderItem внутри Order ==========
class OrderItemInline(admin.TabularInline):
    model = OrderItem
    form = OrderItemForm
    extra = 1
    fields = ['equipment_location', 'common_equipment_location', 'quantity', 'is_slot', 'slot_date_start', 'slot_date_end', 'can_provide', 'is_agreed']
    readonly_fields = ['get_equipment_info']
    show_change_link = True
    autocomplete_fields = ['equipment_location', 'common_equipment_location']
    
    def get_equipment_info(self, obj):
        """Отображает информацию о выбранном оборудовании с экранированием"""
        if obj.pk and obj.equipment_location:
            # ✅ Экранируем все пользовательские данные
            location_name = escape(obj.equipment_location.id_locations.name)
            equipment_name = escape(obj.equipment_location.id_equipments.name)
            quantity = escape(str(obj.equipment_location.quantity))
            
            return format_html(
                '<span style="color: #0039a6;">📍 {}</span> - {} (доступно: {} шт.)',
                location_name,
                equipment_name,
                quantity
            )
        elif obj.pk and obj.common_equipment_location:
            equipment_name = escape(obj.common_equipment_location.id_equipments.name)
            quantity = escape(str(obj.common_equipment_location.quantity))
            
            return format_html(
                '<span style="color: #da291c;">🌍 {}</span> (доступно: {} шт.)',
                equipment_name,
                quantity
            )
        return "Не выбрано"
    get_equipment_info.short_description = 'Информация об оборудовании'
    
    
class EquipmentLocationInline(admin.TabularInline):
    """Отображение оборудования внутри локации"""
    model = EquipmentLocation
    extra = 1
    fields = ['id_types_equipments', 'id_equipments', 'quantity']
    show_change_link = True
    autocomplete_fields = ['id_types_equipments', 'id_equipments']
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "id_equipments":
            # Можно отфильтровать по типу, если нужно
            pass
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class PhotoInline(admin.TabularInline):
    """Отображение фото внутри локации"""
    model = Photo
    extra = 1
    fields = ['name', 'description', 'photo']
    show_change_link = True
    
    
class EquipmentLocationForm(forms.ModelForm):
    """Кастомная форма с валидацией quantity"""
    
    quantity = forms.IntegerField(
        label='Количество',
        min_value=1,
        max_value=999,
        initial=1,  # ✅ Начальное значение
        required=True,  # ✅ Обязательное поле
        error_messages={
            'min_value': 'Количество не может быть меньше 1',
            'max_value': 'Количество не может превышать 999 (максимум 3 знака)',
            'invalid': 'Введите корректное число (1-999)'
        },
        help_text='Введите количество от 1 до 999 (максимум 3 знака)',
        widget=forms.NumberInput(attrs={
            'class': 'vIntegerField',
            'min': '1',
            'max': '999',
            'step': '1',
            'style': 'width: 100px;',
            'oninput': 'validateQuantity(this)',
            'value': '1'  # ✅ Значение по умолчанию в HTML
        })
    )
    
    class Meta:
        model = EquipmentLocation
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # ✅ Устанавливаем значение по умолчанию для новой записи
        if not kwargs.get('instance'):
            self.initial['quantity'] = 1
    
    def clean_quantity(self):
        """Валидация с защитой от None"""
        quantity = self.cleaned_data.get('quantity')
        
        # ✅ Проверка на None
        if quantity is None:
            raise forms.ValidationError('Пожалуйста, укажите количество')
        
        # Проверка на тип
        if not isinstance(quantity, int):
            try:
                quantity = int(quantity)
            except (ValueError, TypeError):
                raise forms.ValidationError('Введите целое число')
        
        # Проверка диапазона
        if quantity < 1:
            raise forms.ValidationError('Количество не может быть меньше 1')
        
        if quantity > 999:
            raise forms.ValidationError('Количество не может превышать 999')
        
        return quantity


class CommonEquipmentLocationForm(forms.ModelForm):
    """Кастомная форма для общего оборудования с валидацией quantity"""
    
    quantity = forms.IntegerField(
        label='Количество',
        min_value=1,
        max_value=999,
        initial=1,
        required=True,
        error_messages={
            'min_value': 'Количество не может быть меньше 1',
            'max_value': 'Количество не может превышать 999 (максимум 3 знака)',
            'invalid': 'Введите корректное число (1-999)'
        },
        help_text='Введите количество от 1 до 999 (максимум 3 знака)',
        widget=forms.NumberInput(attrs={
            'class': 'vIntegerField',
            'min': '1',
            'max': '999',
            'step': '1',
            'style': 'width: 100px;'
        })
    )
    
    class Meta:
        model = CommonEquipmentLocation
        fields = '__all__'
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not kwargs.get('instance'):
            self.initial['quantity'] = 1
    
    def clean_quantity(self):
        quantity = self.cleaned_data.get('quantity')
        
        if quantity is None:
            raise forms.ValidationError('Пожалуйста, укажите количество')
        
        if quantity < 1:
            raise forms.ValidationError('Количество не может быть меньше 1')
        
        if quantity > 999:
            raise forms.ValidationError('Количество не может превышать 999 (максимум 3 знака)')
        
        return quantity
        

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('id', 'email', 'username', 'first_name', 'last_name', 'get_departments', 'is_staff', 'is_superuser')
    list_display_links = ('id', 'email')
    search_fields = ('email', 'username', 'first_name', 'last_name')
    ordering = ('email',)
    
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Персональная информация', {'fields': ('first_name', 'last_name', 'email')}),
        ('Права доступа', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Важные даты', {'fields': ('last_login', 'date_joined')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )
    
    inlines = [UserDepartmentInline]
    
    def get_departments(self, obj):
        departments = obj.user_departments.all()
        return ', '.join([ud.id_department.name for ud in departments])
    get_departments.short_description = 'Подразделения'
    
    def get_fieldsets(self, request, obj=None):
        if not obj:
            return self.add_fieldsets
        return super().get_fieldsets(request, obj)
    
    
@admin.register(History)
class HistoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'get_short_description', 'datetime']
    list_filter = ['user', 'datetime']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'description']
    readonly_fields = ['user', 'description', 'datetime']
    date_hierarchy = 'datetime'
    
    def get_short_description(self, obj):
        return obj.get_short_description()
    get_short_description.short_description = 'Действие'
    
    def has_add_permission(self, request):
        return False  # Запрещаем ручное добавление записей
    
    def has_change_permission(self, request, obj=None):
        return False  # Запрещаем изменение записей
    
    
# ========== Регистрация Application ==========
@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ['id', 'name_preview', 'id_user', 'created_at', 'date_start', 'date_end', 'status', 'get_status_display']
    list_display_links = ['id', 'name_preview']
    list_filter = ['status', 'created_at', 'date_start', 'date_end', 'id_user']
    search_fields = ['name', 'comment', 'id_user__username']
    list_per_page = 20
    ordering = ['-created_at']
    autocomplete_fields = ['id_user']
    readonly_fields = ['created_at']
    list_editable = ['status']
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'id_user', 'status')
        }),
        ('Даты заявки', {
            'fields': ('date_start', 'date_end'),
            'description': 'Укажите даты начала и окончания заявки (необязательно)'
        }),
        ('Дополнительно', {
            'fields': ('comment', 'created_at')
        }),
    )
    
    inlines = [ApplicationApprovalInline]  # Добавляем Inline для согласований
    
    def name_preview(self, obj):
        if len(obj.name) > 50:
            return obj.name[:50] + '...'
        return obj.name
    name_preview.short_description = 'Название'
    
    def get_status_display(self, obj):
        """Отображение статуса с экранированием"""
        colors = {
            'new': '#28a745',
            'in_progress': '#ffc107',
            'completed': '#6c757d',
            'cancelled': '#da291c',
        }
        color = colors.get(obj.status, '#6c757d')
        # ✅ Экранируем статус
        status_text = escape(dict(Application._meta.get_field('status').choices).get(obj.status, obj.status))
        
        return format_html(
            '<span style="background-color: {}; color: white; padding: 2px 8px; border-radius: 12px;">{}</span>',
            color,
            status_text
        )
    get_status_display.short_description = 'Статус (цветной)'


    
# ========== Регистрация Order ==========    
@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'id_user', 'id_application', 'id_location', 'date_time_start', 'date_time_end', 'is_active_display', 'comment_preview']
    list_display_links = ['id']
    list_filter = ['date_time_start', 'id_user', 'id_location']
    search_fields = ['id', 'id_user__username', 'id_location__name', 'comment']
    list_per_page = 20
    ordering = ['-date_time_start']
    inlines = [OrderItemInline]
    autocomplete_fields = ['id_user', 'id_location']
    
    fieldsets = (
        ('Информация о заказе', {
            'fields': ('id_user', 'id_application', 'id_location', 'date_time_start', 'date_time_end'),
            'description': 'Укажите пользователя, даты и, при необходимости, привяжите к помещению'
        }),
        ('Дополнительная информация', {
            'fields': ('comment',),
            'description': 'Добавьте комментарий к заказу'
        }),
    )
    
    def is_active_display(self, obj):
        if obj.is_active:
            return "Активен"
        return "Завершен"
    is_active_display.short_description = 'Статус'
    
    def comment_preview(self, obj):
        if obj.comment:
            return obj.comment[:50] + '...' if len(obj.comment) > 50 else obj.comment
        return "-"
    comment_preview.short_description = 'Комментарий'
    
    def save_model(self, request, obj, form, change):
        if obj.date_time_end and obj.date_time_end < obj.date_time_start:
            from django.contrib import messages
            messages.error(request, 'Дата окончания не может быть раньше даты начала!')
            return
        super().save_model(request, obj, form, change)


# ========== Регистрация OrderItem ==========
@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    form = OrderItemForm
    list_display = [
        'id', 
        'order', 
        'get_equipment_display',
        'get_location_display',
        'quantity',
        'can_provide',
        'is_agreed',
        'is_slot',
        'get_slot_time_display',
        'available_quantity_display'
    ]
    list_display_links = ['id']
    list_filter = ['order', 'equipment_location__id_locations', 'is_agreed', 'is_slot']
    search_fields = [
        'order__id', 
        'equipment_location__id_equipments__name',
        'common_equipment_location__id_equipments__name'
    ]
    list_per_page = 20
    # Временно убираем list_editable для диагностики
    # list_editable = ['can_provide', 'is_agreed', 'is_slot']
    autocomplete_fields = ['order', 'equipment_location', 'common_equipment_location']
    
    fieldsets = (
        ('Информация о заказе', {
            'fields': ('order',)
        }),
        ('Оборудование', {
            'fields': ('equipment_location', 'common_equipment_location', 'quantity'),
        }),
        ('Слот', {
            'fields': ('is_slot', 'slot_date_start', 'slot_date_end'),
            'classes': ('wide',)
        }),
        ('Согласование', {
            'fields': ('can_provide', 'is_agreed'),
            'classes': ('wide',)
        }),
    )
    
    def get_slot_time_display(self, obj):
        if obj.is_slot and obj.slot_date_start and obj.slot_date_end:
            start_str = obj.slot_date_start.strftime('%d.%m.%Y %H:%M')
            end_str = obj.slot_date_end.strftime('%d.%m.%Y %H:%M')
            return f"{start_str} - {end_str}"
        return "-"
    get_slot_time_display.short_description = 'Время слота'
    
    def get_equipment_display(self, obj):
        if obj.equipment_location:
            return obj.equipment_location.id_equipments.name
        elif obj.common_equipment_location:
            return f"🌍 {obj.common_equipment_location.id_equipments.name}"
        return "-"
    get_equipment_display.short_description = 'Оборудование'
    
    def get_location_display(self, obj):
        if obj.equipment_location:
            return obj.equipment_location.id_locations.name
        elif obj.common_equipment_location:
            return "Общее (не привязано)"
        return "-"
    get_location_display.short_description = 'Локация'
    
    def available_quantity_display(self, obj):
        if obj.equipment_location:
            return f"{obj.equipment_location.quantity} шт."
        elif obj.common_equipment_location:
            return f"{obj.common_equipment_location.quantity} шт."
        return "-"
    available_quantity_display.short_description = 'Доступно'
        

class LocationForm(forms.ModelForm):
    """Кастомная форма для Location с поддержкой HTML"""
    
    description = forms.CharField(
        label='Описание',
        widget=forms.Textarea(attrs={
            'rows': 12,
            'cols': 100,
            'style': 'width: 100%; font-family: monospace; font-size: 14px; line-height: 1.5;',
            'placeholder': 'Введите описание помещения. Поддерживается HTML: <br>, <p>, <ul>, <li>, <strong>, <em> и т.д.'
        }),
        required=False,
        help_text='Поддерживается HTML разметка: <strong>жирный</strong>, <em>курсив</em>, <ul><li>списки</li></ul> и т.д.'
    )
    
    class Meta:
        model = Location
        fields = '__all__'
    
    def clean_name(self):
        name = self.cleaned_data.get('name')
        if name:
            name = name.strip()
            if Location.objects.filter(name__iexact=name).exclude(pk=self.instance.pk).exists():
                raise forms.ValidationError('Помещение с таким названием уже существует')
        return name


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    form = LocationForm
    list_display = ['id', 'name', 'size', 'is_event', 'description_preview']
    list_display_links = ['id', 'name']
    list_filter = ['size', 'is_event']
    search_fields = ['name', 'description']
    list_per_page = 20
    ordering = ['name']
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'size', 'is_event'),
        }),
        ('Описание (поддерживается HTML)', {
            'fields': ('description',),
            'description': 'Вы можете использовать HTML теги для форматирования: &lt;strong&gt;, &lt;em&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;p&gt;, &lt;br&gt; и др.',
            'classes': ('wide',),
        }),
    )
    
    def description_preview(self, obj):
        """Предпросмотр описания в списке (очищаем HTML и экранируем)"""
        if obj.description:
            from django.utils.html import strip_tags
            # ✅ Сначала удаляем HTML теги, потом экранируем
            plain_text = strip_tags(obj.description)
            safe_text = escape(plain_text)
            return safe_text[:100] + '...' if len(safe_text) > 100 else safe_text
        return '-'
    description_preview.short_description = 'Описание (кратко)'


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    form = EquipmentForm
    list_display = ['id', 'name']
    list_display_links = ['id', 'name']
    search_fields = ['name']
    list_per_page = 20
    ordering = ['name']


class TypeEquipmentForm(forms.ModelForm):
    class Meta:
        model = TypeEquipment
        fields = '__all__'
    
    def clean_name(self):
        name = self.cleaned_data.get('name')
        if name:
            name = name.strip()
            if TypeEquipment.objects.filter(name__iexact=name).exclude(pk=self.instance.pk).exists():
                raise ValidationError('Тип оборудования с таким названием уже существует')
        return name


@admin.register(TypeEquipment)
class TypeEquipmentAdmin(admin.ModelAdmin):
    form = TypeEquipmentForm
    list_display = ['id', 'name']
    list_display_links = ['id', 'name']
    search_fields = ['name']
    list_per_page = 20
    ordering = ['name']
    

@admin.register(EquipmentLocation)
class EquipmentLocationAdmin(admin.ModelAdmin):
    form = EquipmentLocationForm
    list_display = ['id', 'get_type_display', 'get_equipment_display', 'get_location_display', 'quantity']
    list_filter = ['id_types_equipments', 'id_locations']
    search_fields = ['id_types_equipments__name', 'id_equipments__name', 'id_locations__name']
    list_per_page = 20
    ordering = ['id_locations', 'id_equipments']
    autocomplete_fields = ['id_types_equipments', 'id_equipments', 'id_locations']
    
    def get_type_display(self, obj):
        return obj.id_types_equipments.name
    get_type_display.short_description = 'Тип оборудования'
    
    def get_equipment_display(self, obj):
        return obj.id_equipments.name
    get_equipment_display.short_description = 'Оборудование'
    
    def get_location_display(self, obj):
        return obj.id_locations.name
    get_location_display.short_description = 'Локация'
    
    def save_model(self, request, obj, form, change):
        """Сохранение с дополнительной проверкой"""
        if obj.quantity is None:
            obj.quantity = 1
        super().save_model(request, obj, form, change)
        
    # Добавляем JavaScript валидацию на клиенте
    class Media:
        js = ('admin/js/quantity_validation.js',)


@admin.register(CommonEquipmentLocation)
class CommonEquipmentLocationAdmin(admin.ModelAdmin):
    form = CommonEquipmentLocationForm
    list_display = ['id', 'get_type_display', 'get_equipment_display', 'quantity']
    list_display_links = ['id']
    list_filter = ['id_types_equipments']
    search_fields = ['id_types_equipments__name', 'id_equipments__name']
    list_per_page = 20
    ordering = ['id_types_equipments', 'id_equipments']
    autocomplete_fields = ['id_types_equipments', 'id_equipments']
    
    def get_type_display(self, obj):
        return obj.id_types_equipments.name
    get_type_display.short_description = 'Тип оборудования'
    
    def get_equipment_display(self, obj):
        return obj.id_equipments.name
    get_equipment_display.short_description = 'Оборудование'
    
    def save_model(self, request, obj, form, change):
        if obj.quantity is None:
            obj.quantity = 1
        super().save_model(request, obj, form, change)
        

@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'get_location_name', 'is_main', 'description_preview', 'photo_preview', 'created_at']
    list_display_links = ['id', 'name']
    list_filter = ['id_location', 'is_main', 'created_at']
    search_fields = ['name', 'description', 'id_location__name']
    list_per_page = 20
    ordering = ['-is_main', '-created_at']
    readonly_fields = ['photo_preview']
    autocomplete_fields = ['id_location']
    list_editable = ['is_main']
    
    fieldsets = (
        ('Информация о фото', {
            'fields': ('name', 'description', 'id_location', 'is_main')
        }),
        ('Файл и превью', {
            'fields': ('photo', 'photo_preview'),
        }),
    )
    
    def get_location_name(self, obj):
        return obj.id_location.name
    get_location_name.short_description = 'Локация'
    get_location_name.admin_order_field = 'id_location__name'
    
    def description_preview(self, obj):
        """Предпросмотр описания с экранированием"""
        # ✅ Экранируем описание
        if obj.description:
            safe_description = escape(obj.description)
            if len(safe_description) > 50:
                return safe_description[:50] + '...'
            return safe_description
        return '-'
    description_preview.short_description = 'Описание (кратко)'
    
    def photo_preview(self, obj):
        """Превью фото с экранированием"""
        if obj.photo:
            border_color = '#da291c' if obj.is_main else '#e2e8f0'
            border_width = '3px' if obj.is_main else '1px'
            # ✅ URL фото не требует экранирования, это системный путь
            return format_html(
                '<img src="{}" style="width: 100px; height: auto; border-radius: 8px; border: {} solid {};" />',
                obj.photo.url,
                border_width,
                border_color
            )
        return "Нет фото"
    photo_preview.short_description = 'Превью'
    
    def save_model(self, request, obj, form, change):
        # Сохраняем объект
        super().save_model(request, obj, form, change)
        # Если это главное фото, убеждаемся что другие фото этой локации не главные
        if obj.is_main:
            Photo.objects.filter(id_location=obj.id_location, is_main=True).exclude(id=obj.id).update(is_main=False)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ['id', 'id_user', 'get_short_name', 'get_application_display', 'get_short_comment', 'get_data_summary', 'created_at']
    list_display_links = ['id', 'id_user']
    list_filter = ['created_at', 'id_user']
    search_fields = ['id_user__username', 'id_user__email', 'id_application__name', 'name', 'comment', 'data']
    readonly_fields = ['created_at', 'data_preview']
    date_hierarchy = 'created_at'
    list_per_page = 20
    ordering = ['-created_at']
    autocomplete_fields = ['id_user', 'id_application']
    
    fieldsets = (
        ('Информация об отзыве', {
            'fields': ('id_user', 'id_application', 'name', 'comment', 'data')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'data_preview'),
            'classes': ('collapse',)
        }),
    )
    
    def get_data_summary(self, obj):
        """Краткое отображение данных JSON"""
        if not obj.data:
            return '-'
        items = []
        if 'browser' in obj.data:
            items.append(f"🌐 {obj.data['browser'][:30]}")
        if 'os' in obj.data:
            items.append(f"💻 {obj.data['os'][:20]}")
        if 'url' in obj.data:
            items.append(f"🔗 {obj.data['url'][:40]}")
        if 'event_rating' in obj.data:
            items.append(f"⭐ {obj.data['event_rating']}/10")
        return ', '.join(items) if items else '📦 Есть данные'
    get_data_summary.short_description = 'Доп. данные'
    
    def data_preview(self, obj):
        """Подробный просмотр JSON в админке с экранированием"""
        if not obj.data:
            return "Нет дополнительных данных"
        
        import json
        
        # Форматируем JSON с отступами
        json_str = json.dumps(obj.data, ensure_ascii=False, indent=2)
        
        # ✅ Экранируем JSON строку для HTML
        json_str = escape(json_str)
        
        html = f'''
        <div style="background: #f5f5f5; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 300px; overflow: auto;">
            <strong>📋 Дополнительные данные:</strong>
            <pre style="margin: 10px 0 0 0; white-space: pre-wrap; word-wrap: break-word; background: #fff; padding: 8px; border-radius: 4px;">{json_str}</pre>
        </div>
        '''
        return mark_safe(html)
    data_preview.short_description = 'Просмотр данных (JSON)'
    
    def get_application_display(self, obj):
        if obj.id_application:
            return f"Заявка #{obj.id_application.id} - {obj.id_application.name[:50]}"
        return "— (Общий отзыв)"
    get_application_display.short_description = 'Заявка'
    
    def get_short_name(self, obj):
        """Короткое название с экранированием"""
        if obj.name:
            # ✅ Экранируем имя
            safe_name = escape(obj.name)
            return safe_name[:50] + '...' if len(safe_name) > 50 else safe_name
        return '—'
    get_short_name.short_description = 'Название'
    
    def get_short_comment(self, obj):
        """Короткий комментарий с экранированием"""
        # ✅ Экранируем комментарий
        safe_comment = escape(obj.comment)
        return safe_comment[:100] + '...' if len(safe_comment) > 100 else safe_comment
    get_short_comment.short_description = 'Комментарий'
    
    # Действие для экспорта в CSV
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="feedback_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Пользователь', 'Email пользователя', 'Название отзыва', 'ID заявки', 'Название заявки', 'Комментарий', 'Оценка мероприятия', 'Отзыв о мероприятии', 'Доп. данные', 'Дата создания'])
        
        for obj in queryset:
            # Извлекаем данные из JSON поля
            event_rating = obj.data.get('event_rating', '') if obj.data else ''
            event_feedback = obj.data.get('event_feedback', '') if obj.data else ''
            
            writer.writerow([
                obj.id,
                obj.id_user.username,
                obj.id_user.email,
                obj.name or '',
                obj.id_application.id if obj.id_application else '',
                obj.id_application.name[:100] if obj.id_application and obj.id_application.name else '',
                obj.comment,
                event_rating,
                event_feedback,
                json.dumps(obj.data, ensure_ascii=False) if obj.data else '',
                obj.created_at.strftime('%d.%m.%Y %H:%M:%S')
            ])
        
        self.message_user(request, f'Экспортировано {queryset.count()} записей')
        return response
    export_to_csv.short_description = 'Экспорт в CSV'
    

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'is_approval_required', 'get_type_equipment_count', 'get_user_count', 'created_at', 'updated_at']
    list_display_links = ['id', 'name']
    list_filter = ['created_at', 'is_approval_required']
    search_fields = ['name', 'description']
    list_per_page = 20
    ordering = ['name']
    readonly_fields = ['created_at', 'updated_at']
    list_editable = ['is_approval_required']
    
    fieldsets = (
        ('Информация о подразделении', {
            'fields': ('name', 'description', 'is_approval_required'),
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    inlines = [DepartmentTypeEquipmentInline]
    
    def get_type_equipment_count(self, obj):
        return obj.department_type_equipment.count()
    get_type_equipment_count.short_description = 'Типов оборудования'
    
    def get_user_count(self, obj):
        return obj.department_users.count()
    get_user_count.short_description = 'Сотрудников'
    
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="departments_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Подразделение', 'Описание', 'Требуется согласование', 'Типов оборудования', 'Сотрудников', 'Дата создания', 'Дата обновления'])
        
        for obj in queryset:
            writer.writerow([
                obj.id,
                obj.name,
                obj.description or '',
                'Да' if obj.is_approval_required else 'Нет',
                obj.department_type_equipment.count(),
                obj.department_users.count(),
                obj.created_at.strftime('%d.%m.%Y %H:%M:%S'),
                obj.updated_at.strftime('%d.%m.%Y %H:%M:%S')
            ])
        
        self.message_user(request, f'Экспортировано {queryset.count()} записей')
        return response
    export_to_csv.short_description = 'Экспорт в CSV'


@admin.register(UserDepartment)
class UserDepartmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'get_user_display', 'get_department_display', 'is_head', 'created_at']
    list_display_links = ['id']
    list_filter = ['is_head', 'created_at', 'id_department']
    search_fields = ['id_user__username', 'id_user__email', 'id_department__name']
    list_per_page = 20
    ordering = ['id_department', 'id_user']
    autocomplete_fields = ['id_user', 'id_department']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Связь пользователя с подразделением', {
            'fields': ('id_user', 'id_department', 'is_head'),
        }),
        ('Системная информация', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
    
    def get_user_display(self, obj):
        return obj.id_user.get_full_name() or obj.id_user.username
    get_user_display.short_description = 'Пользователь'
    get_user_display.admin_order_field = 'id_user__username'
    
    def get_department_display(self, obj):
        return obj.id_department.name
    get_department_display.short_description = 'Подразделение'
    get_department_display.admin_order_field = 'id_department__name'
    
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="user_departments_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Пользователь', 'Email', 'Подразделение', 'Руководитель', 'Дата создания'])
        
        for obj in queryset:
            writer.writerow([
                obj.id,
                obj.id_user.username,
                obj.id_user.email,
                obj.id_department.name,
                'Да' if obj.is_head else 'Нет',
                obj.created_at.strftime('%d.%m.%Y %H:%M:%S')
            ])
        
        self.message_user(request, f'Экспортировано {queryset.count()} записей')
        return response
    export_to_csv.short_description = 'Экспорт в CSV'
    
    
@admin.register(DepartmentTypeEquipment)
class DepartmentTypeEquipmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'get_department_display', 'get_type_equipment_display', 'created_at']
    list_display_links = ['id']
    list_filter = ['created_at', 'id_department', 'id_type_equipment']
    search_fields = ['id_department__name', 'id_type_equipment__name']
    list_per_page = 20
    ordering = ['id_department', 'id_type_equipment']
    autocomplete_fields = ['id_department', 'id_type_equipment']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Связь подразделения с типом оборудования', {
            'fields': ('id_department', 'id_type_equipment')
        }),
        ('Системная информация', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
    
    def get_department_display(self, obj):
        return obj.id_department.name
    get_department_display.short_description = 'Подразделение'
    get_department_display.admin_order_field = 'id_department__name'
    
    def get_type_equipment_display(self, obj):
        return obj.id_type_equipment.name
    get_type_equipment_display.short_description = 'Тип оборудования'
    get_type_equipment_display.admin_order_field = 'id_type_equipment__name'
    
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="departments_types_equipment_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Подразделение', 'Тип оборудования', 'Дата создания'])
        
        for obj in queryset:
            writer.writerow([
                obj.id,
                obj.id_department.name,
                obj.id_type_equipment.name,
                obj.created_at.strftime('%d.%m.%Y %H:%M:%S')
            ])
        
        self.message_user(request, f'Экспортировано {queryset.count()} записей')
        return response
    export_to_csv.short_description = 'Экспорт в CSV'
    
    
@admin.register(ApplicationApproval)
class ApplicationApprovalAdmin(admin.ModelAdmin):
    list_display = ['id', 'get_department_display', 'get_application_display', 'get_user_display', 'is_agreed', 'date_agreed', 'created_at']
    list_display_links = ['id']
    list_filter = ['is_agreed', 'created_at', 'date_agreed', 'id_department', 'id_user']
    search_fields = ['id_department__name', 'id_application__name', 'id_user__username', 'comment']
    list_per_page = 20
    ordering = ['-created_at']
    autocomplete_fields = ['id_department', 'id_application', 'id_user']
    readonly_fields = ['created_at', 'updated_at', 'date_agreed']
    list_editable = ['is_agreed']
    
    fieldsets = (
        ('Информация о согласовании', {
            'fields': ('id_department', 'id_application', 'id_user', 'is_agreed')
        }),
        ('Дополнительно', {
            'fields': ('comment',)
        }),
        ('Системная информация', {
            'fields': ('date_agreed', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_department_display(self, obj):
        return obj.id_department.name
    get_department_display.short_description = 'Подразделение'
    get_department_display.admin_order_field = 'id_department__name'
    
    def get_application_display(self, obj):
        return f"№{obj.id_application.id} - {obj.id_application.name[:50]}"
    get_application_display.short_description = 'Заявка'
    get_application_display.admin_order_field = 'id_application__name'
    
    def get_user_display(self, obj):
        if obj.id_user:
            return obj.id_user.username
        return "—"
    get_user_display.short_description = 'Пользователь'
    get_user_display.admin_order_field = 'id_user__username'
    
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="application_approvals_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Подразделение', 'Заявка', 'Пользователь', 'Согласовано', 'Дата согласования', 'Комментарий', 'Дата создания'])
        
        for obj in queryset:
            writer.writerow([
                obj.id,
                obj.id_department.name,
                f"{obj.id_application.id} - {obj.id_application.name[:50]}",
                obj.id_user.username if obj.id_user else '',
                'Да' if obj.is_agreed else 'Нет',
                obj.date_agreed.strftime('%d.%m.%Y %H:%M:%S') if obj.date_agreed else '',
                obj.comment or '',
                obj.created_at.strftime('%d.%m.%Y %H:%M:%S')
            ])
        
        self.message_user(request, f'Экспортировано {queryset.count()} записей')
        return response
    export_to_csv.short_description = 'Экспорт в CSV'
    
    
@admin.register(BaseGroup)
class GroupAdmin(BaseGroupAdmin):
    """Расширенный администратор групп с управлением правами"""
    list_display = ['id', 'name', 'get_comment_preview', 'get_user_count']
    list_display_links = ['id', 'name']
    search_fields = ['name', 'profile__comment']
    list_per_page = 20
    ordering = ['name']
    
    # Добавляем поля для управления правами
    fieldsets = (
        (None, {
            'fields': ('name',)
        }),
        ('Права доступа', {
            'fields': ('permissions',),
            'classes': ('wide',),
            'description': 'Выберите права, которые будут назначены группе'
        }),
    )
    
    # Добавляем фильтр по правам
    filter_horizontal = ('permissions',)
    
    # Добавляем в list_filter фильтр по правам
    list_filter = ['permissions']
    
    inlines = [GroupProfileInline]
    
    def get_comment_preview(self, obj):
        """Предпросмотр комментария группы с экранированием"""
        if hasattr(obj, 'profile') and obj.profile and obj.profile.comment:
            # ✅ Экранируем комментарий
            safe_comment = escape(obj.profile.comment)
            return safe_comment[:100] + '...' if len(safe_comment) > 100 else safe_comment
        return '-'
    get_comment_preview.short_description = 'Комментарий'
    
    def get_user_count(self, obj):
        return obj.user_set.count()
    get_user_count.short_description = 'Пользователей'
    
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        GroupProfile.objects.get_or_create(group=obj)
    
    actions = ['export_to_csv']
    
    def export_to_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="groups_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow(['ID', 'Название группы', 'Комментарий', 'Количество пользователей', 'Права'])
        
        for obj in queryset:
            comment = ''
            if hasattr(obj, 'profile') and obj.profile:
                comment = obj.profile.comment or ''
            
            permissions = ', '.join([p.name for p in obj.permissions.all()])
            
            writer.writerow([
                obj.id,
                obj.name,
                comment,
                obj.user_set.count(),
                permissions
            ])
        
        self.message_user(request, f'Экспортировано {queryset.count()} записей')
        return response
    export_to_csv.short_description = 'Экспорт в CSV'