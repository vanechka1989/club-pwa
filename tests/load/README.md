# Нагрузочная проверка Club PWA

Сценарий `club-150.js` проверяет реальные авторизованные API-запросы и ступенчато поднимает нагрузку 50 → 100 → 150 пользователей. Для корректного распределения желательно передать несколько тестовых сессий через запятую.

## Безопасный smoke-test

```bash
k6 run -e LOAD_PROFILE=smoke -e BASE_URL=https://staging.example.ru -e SESSION_COOKIES=token1,token2 tests/load/club-150.js
```

## Realtime SSE: 100 одновременных клиентов

`community-100.mjs` открывает реальные SSE-потоки, ступенчато поднимает 10 → 25 → 50 → 75 → 100 клиентов, удерживает 100 соединений 3 минуты, проверяет обычную доставку, залп, переподключения и параллельный HTTP-профиль. Используйте только временную скрытую тему и временную сессию; скрипт удаляет сообщения в `finally`, а тему и сессию после прогона нужно удалить из БД.

```bash
BASE_URL=https://club2.myn8nservertest.ru \
LOAD_PROFILE=production-100 \
CONFIRM_PRODUCTION_LOAD=YES \
SESSION_COOKIE=temporary-secret \
TEST_TOPIC_ID=temporary-topic-id \
node tests/load/community-100.mjs
```

В PowerShell переменные задаются через `$env:NAME='value'`. Токен никогда не сохраняется в отчёте. Для локальной проверки используйте `LOAD_PROFILE=smoke`.

## S3: 100 одновременных загрузок уроков

`s3-100.mjs` использует тот же multipart-путь, что редактор уроков. Smoke-профиль отправляет 3 изображения по 1 МиБ и 2 видео по 9 МиБ. Профиль `production-100` сначала инициализирует 100 уникальных объектов ступенями 5 → 10 → 25 → 50 → 75 → 100, затем одновременно передаёт 100 изображений по 2 МиБ. После проверки и удаления изображений запускаются 25 одновременных видео по 24 МиБ (три части по 8 МиБ).

```bash
BASE_URL=https://club2.myn8nservertest.ru \
LOAD_PROFILE=production-100 \
CONFIRM_PRODUCTION_LOAD=YES \
SESSION_COOKIE=temporary-owner-session \
LOAD_RUN_ID=s3-load-20260718 \
node tests/load/s3-100.mjs
```

Сценарий не создаёт карточки уроков. Он проверяет точный размер каждого объекта через административный S3 API и удаляет завершённые объекты в `finally`. При аварийном прерывании JSON-отчёт содержит `objectKey` и `uploadId` незавершённых multipart-сессий для обязательного серверного abort. Токен сессии в отчёт не записывается.

Критерии прохождения: завершены и проверены 100% объектов, ошибок запросов не больше 1%, API всё время healthy/ready, RSS API ниже 1,5 ГБ, нет перезапусков контейнера, после очистки не осталось объектов или multipart-сессий.

## Полный тест после увеличения VPS

```bash
k6 run -e BASE_URL=https://club2.myn8nservertest.ru -e CONFIRM_PRODUCTION_LOAD=YES -e SESSION_COOKIES=token1,token2,token3 tests/load/club-150.js
```

Профиль k6 `production-100` предназначен для контролируемой проверки текущего VPS. Полный профиль 150 по-прежнему нельзя запускать на VPS 2 vCPU / 2 ГБ: он предназначен для проверки конфигурации 8 vCPU / 16 ГБ. Production-защита требует явный `CONFIRM_PRODUCTION_LOAD=YES`.

Критерии прохождения: 100% доставки без дублей, отсутствие обрывов SSE, меньше 0,5% HTTP-ошибок, SSE p95 ниже 500 мс и p99 ниже 1,5 с, HTTP p95 ниже 500 мс и p99 ниже 1,5 с. Во время теста также проверяются health/readiness, память API и число серверных подписчиков. Контейнерные ресурсы и PostgreSQL снимаются отдельным серверным мониторингом.

## Оптимизированный API-профиль: 100 клиентов

`api-profile-100.mjs` воспроизводит новый клиентский профиль после объединения фоновых запросов: каждый из 100 потоков последовательно запрашивает `/api/app-state` и `/api/community/topics`, всего три раунда. Ответы проверяются по схеме, а временная owner-сессия не сохраняется в отчёте.

Production-прогон запускается вручную workflow `API load 100`. Workflow создаёт сессию внутри production-сервера, маскирует токен, отзывает сессию в `always()` и сохраняет только JSON-отчёт.

```bash
BASE_URL=https://club2.myn8nservertest.ru \
CONFIRM_PRODUCTION_LOAD=YES \
SESSION_COOKIE=temporary-owner-session \
node tests/load/api-profile-100.mjs
```
