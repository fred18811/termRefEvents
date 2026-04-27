from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from . import views

app_name = 'mainapp'

urlpatterns = [
    # Главная страница
    path('', views.index, name='index'),
    
    # Авторизация
    path('api/login/', views.login_view, name='login'),
    path('api/logout/', views.logout_view, name='logout'),
    path('api/check-auth/', views.check_auth, name='check_auth'),
    path('api/get-user-info/', views.get_user_info, name='get_user_info'),
    
    # API для локаций и оборудования
    path('api/location-photo/<int:location_id>/', views.get_location_photo, name='location_photo'),
    path('api/equipment-by-location/', views.get_equipment_by_location, name='equipment_by_location'),
    path('api/common-equipment/', views.get_common_equipment, name='common_equipment'),
    path('api/check-equipment-location/', views.check_equipment_location, name='check_equipment_location'),
    
    # API для заказов
    path('api/save-order/', views.save_order, name='save_order'),
    path('api/save-multiple-orders/', views.save_multiple_orders, name='save_multiple_orders'),
    path('api/get-orders/', views.get_orders, name='get_orders'),
    path('api/get-order-items/', views.get_order_items, name='get_order_items'),
    path('api/export-orders-to-excel/', views.export_orders_to_excel, name='export_orders_to_excel'),
    
    # ========== РЕДАКТИРОВАНИЕ ЗАКАЗОВ (ДОБАВИТЬ ЭТИ СТРОКИ) ==========
    path('api/order/<int:order_id>/', views.get_order_details, name='get_order_details'),
    path('api/order/<int:order_id>/update/', views.update_order, name='update_order'),
    path('api/order/<int:order_id>/cancel/', views.cancel_order, name='cancel_order'),
    path('api/order/<int:order_id>/duplicate/', views.duplicate_order, name='duplicate_order'),
    
    # API для помещений
    path('api/get-rooms/', views.get_rooms, name='get_rooms'),
    path('api/get-room-details/', views.get_room_details, name='get_room_details'),
    
    # Экспорт
    path('api/export-to-excel/', views.export_to_excel, name='export_to_excel'),
    
    # Заявки
    path('api/applications/', views.get_applications, name='get_applications'),
    path('api/applications/create/', views.create_application, name='create_application'),
    path('api/applications/<int:app_id>/', views.get_application_detail, name='get_application_detail'),
    
    path('api/check-equipment-availability/', views.check_equipment_availability, name='check_equipment_availability'),
    path('room/<int:room_id>/', views.room_detail, name='room_detail'),
    path('api/check-datetime-busy/', views.check_datetime_busy, name='check_datetime_busy'),
    path('api/get-busy-time-slots/', views.get_busy_time_slots, name='get_busy_time_slots'),
    path('api/get-busy-dates/', views.get_busy_dates, name='get_busy_dates'),
    
    path('api/history/', views.get_user_history, name='get_user_history'),
    path('api/history/all/', views.get_all_history, name='get_all_history'),
    path('api/history/clear/', views.clear_old_history, name='clear_old_history'),
    # Регистрация
    # path('api/register/', views.register_view, name='register'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)