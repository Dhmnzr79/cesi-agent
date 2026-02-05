server {
    server_name bot.jeeptour41.ru;

    # Статика виджета
    location /widget/ {
        alias /var/www/html/widget/;
        try_files $uri =404;
        add_header Cache-Control "no-cache";
    }

    # Flowise API (КРИТИЧНО)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend заявок
    location /lead/send-lead {
        proxy_pass http://127.0.0.1:3001/api/send-lead;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Flowise UI
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/bot.jeeptour41.ru/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/bot.jeeptour41.ru/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = bot.jeeptour41.ru) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    server_name bot.jeeptour41.ru;
    return 404; # managed by Certbot
}
