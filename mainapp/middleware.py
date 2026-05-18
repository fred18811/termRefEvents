from django.utils.deprecation import MiddlewareMixin
from django.utils.html import escape
from django.http import HttpResponse

class XSSProtectionMiddleware(MiddlewareMixin):
    """
    Middleware для дополнительной защиты от XSS
    """
    
    def process_response(self, request, response):
        if isinstance(response, HttpResponse) and response.get('Content-Type', '').startswith('text/html'):
            # Добавляем заголовки безопасности
            response['X-XSS-Protection'] = '1; mode=block'
            response['X-Content-Type-Options'] = 'nosniff'
            response['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline';"
        return response