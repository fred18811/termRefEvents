from django.core.mail import send_mail, EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.contrib.auth.models import Group, User
from django.conf import settings
import logging
from .models import Application

logger = logging.getLogger(__name__)

class EmailService:
    """Сервис для отправки email уведомлений"""
    
    @staticmethod
    def get_mail_receivers():
        """Получить всех пользователей из группы MailReciver"""
        try:
            group = Group.objects.get(name='MailReciver')
            return list(group.user_set.all())
        except Group.DoesNotExist:
            logger.warning('Группа MailReciver не найдена')
            return []
    
    @staticmethod
    def send_new_application_notification(application, user):
        """
        Отправка уведомления о новой заявке
        
        Args:
            application: Объект заявки (Application)
            user: Пользователь, создавший заявку
        """
        receivers = EmailService.get_mail_receivers()
        
        if not receivers:
            logger.info('Нет получателей для уведомлений')
            return
        
        # Собираем информацию о заявке
        orders = application.order_set.all()
        
        # Формируем список локаций и оборудования
        locations_info = []
        for order in orders:
            location_name = order.id_location.name if order.id_location else 'Общее оборудование'
            items_count = order.order_items.count()
            total_quantity = sum(item.quantity for item in order.order_items.all())
            
            locations_info.append({
                'name': location_name,
                'date_start': order.date_time_start,
                'date_end': order.date_time_end,
                'items_count': items_count,
                'total_quantity': total_quantity
            })
        
        # Создаем контекст для шаблона
        context = {
            'application_id': application.id,
            'application_name': application.name,
            'application_comment': application.comment or 'Нет комментария',
            'user': user,
            'user_email': user.email,
            'user_full_name': user.get_full_name() or user.username,
            'created_at': application.created_at,
            'locations_count': len(locations_info),
            'locations_info': locations_info,
            'status_display': dict(Application._meta.get_field('status').choices).get(application.status, application.status),
            'admin_url': settings.SITE_URL if hasattr(settings, 'SITE_URL') else 'http://127.0.0.1:8000'
        }
        
        # Рендерим HTML шаблон
        try:
            html_message = render_to_string('mainapp/email/new_application_notification.html', context)
            plain_message = strip_tags(html_message)
            
            # Тема письма
            subject = f'🔔 Новая заявка #{application.id} - {application.name[:50]}'
            
            # Отправляем каждому получателю
            for receiver in receivers:
                try:
                    send_mail(
                        subject=subject,
                        message=plain_message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[receiver.email],
                        html_message=html_message,
                        fail_silently=False
                    )
                    logger.info(f'Уведомление отправлено на {receiver.email}')
                except Exception as e:
                    logger.error(f'Ошибка отправки на {receiver.email}: {e}')
                    
        except Exception as e:
            logger.error(f'Ошибка при формировании письма: {e}')
    
    @staticmethod
    def send_application_status_notification(application, old_status, new_status, changed_by):
        """
        Отправка уведомления об изменении статуса заявки
        """
        receivers = EmailService.get_mail_receivers()
        
        if not receivers:
            return
        
        context = {
            'application_id': application.id,
            'application_name': application.name,
            'old_status': old_status,
            'new_status': new_status,
            'changed_by': changed_by,
            'user': application.id_user,
            'admin_url': settings.SITE_URL if hasattr(settings, 'SITE_URL') else 'http://127.0.0.1:8000'
        }
        
        try:
            html_message = render_to_string('mainapp/email/application_status_change.html', context)
            plain_message = strip_tags(html_message)
            
            subject = f'📝 Изменение статуса заявки #{application.id}'
            
            for receiver in receivers:
                try:
                    send_mail(
                        subject=subject,
                        message=plain_message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[receiver.email],
                        html_message=html_message,
                        fail_silently=False
                    )
                except Exception as e:
                    logger.error(f'Ошибка отправки на {receiver.email}: {e}')
        except Exception as e:
            logger.error(f'Ошибка при формировании письма: {e}')
    
    @staticmethod
    def send_application_status_notification(application, old_status, new_status, changed_by):
        """
        Отправка уведомления об изменении статуса заявки
        """
        receivers = EmailService.get_mail_receivers()
        
        if not receivers:
            return
        
        status_choices = dict(Application._meta.get_field('status').choices)
        
        context = {
            'application_id': application.id,
            'application_name': application.name,
            'old_status': status_choices.get(old_status, old_status),
            'new_status': status_choices.get(new_status, new_status),
            'changed_by': changed_by,
            'user': application.id_user,
            'admin_url': getattr(settings, 'SITE_URL', 'http://127.0.0.1:8000')
        }
        
        try:
            html_message = render_to_string('mainapp/email/application_status_change.html', context)
            plain_message = strip_tags(html_message)
            
            subject = f'📝 Изменение статуса заявки #{application.id}'
            
            for receiver in receivers:
                try:
                    send_mail(
                        subject=subject,
                        message=plain_message,
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=[receiver.email],
                        html_message=html_message,
                        fail_silently=False
                    )
                    logger.info(f'Уведомление об изменении статуса отправлено на {receiver.email}')
                except Exception as e:
                    logger.error(f'Ошибка отправки на {receiver.email}: {e}')
        except Exception as e:
            logger.error(f'Ошибка при формировании письма: {e}')