from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from django.conf import settings

class Command(BaseCommand):
    help = 'Тестовая отправка email'

    def add_arguments(self, parser):
        parser.add_argument('email', type=str, help='Email получателя')

    def handle(self, *args, **options):
        email = options['email']
        
        try:
            send_mail(
                subject='Тестовое письмо',
                message='Это тестовое письмо для проверки настроек почты.',
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
            self.stdout.write(self.style.SUCCESS(f'✅ Письмо успешно отправлено на {email}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Ошибка: {e}'))