# Скрипт для настройки Git репозитория
# Закройте Cursor перед запуском этого скрипта

Write-Host "Настройка Git репозитория..." -ForegroundColor Green

# Удаляем поврежденную папку .git если она есть
if (Test-Path .git) {
    Write-Host "Удаление старой папки .git..." -ForegroundColor Yellow
    Remove-Item -Path .git -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Инициализируем git репозиторий
Write-Host "Инициализация Git репозитория..." -ForegroundColor Green
git init --initial-branch=main

if ($LASTEXITCODE -ne 0) {
    Write-Host "Ошибка при инициализации Git. Убедитесь, что все программы закрыты." -ForegroundColor Red
    exit 1
}

# Добавляем remote
Write-Host "Добавление remote origin..." -ForegroundColor Green
git remote add origin https://github.com/Dhmnzr79/cesi-agent.git

# Добавляем файлы
Write-Host "Добавление файлов..." -ForegroundColor Green
git add .

# Делаем первый коммит
Write-Host "Создание первого коммита..." -ForegroundColor Green
git commit -m "Initial commit: widget with sessionId support"

# Проверяем remote
Write-Host "`nПроверка настроек remote:" -ForegroundColor Cyan
git remote -v

Write-Host "`nГотово! Теперь выполните:" -ForegroundColor Green
Write-Host "git push -u origin main" -ForegroundColor Yellow
