# Правила проекта

## Production deployment

- Основное рабочее приложение: `https://club2.myn8nservertest.ru`.
- Основной production-сервер: `2.27.28.89`.
- Каталог основного production: `/opt/club-pwa`.
- `https://club.myn8nservertest.ru` и `/opt/club-crm` не являются целью обычного production-деплоя. Не изменять и не обновлять их без отдельного явного указания пользователя.
- Перед каждым деплоем обязательно выполнить read-only preflight: проверить домен, IP/hostname, каталог репозитория, remote URL, текущий commit сервера и версию, которую публично отдаёт выбранный домен.
- Сопоставить результаты preflight с тремя значениями выше. При любом несовпадении остановить деплой и сообщить пользователю; не выбирать цель по старым планам, последним SSH-командам или предположению.
- Деплоить только точный проверенный commit через `DEPLOY_DIR=/opt/club-pwa bash /opt/club-pwa/deploy/update.sh` на `2.27.28.89`.
- После деплоя подтвердить: public `/api/health`, `/api/ready`, версию приложения, service worker, server `HEAD` и deployed-commit. Все они должны относиться к `club2.myn8nservertest.ru` и одному commit.
