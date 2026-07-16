# Нагрузочная проверка Club PWA

Сценарий `club-150.js` проверяет реальные авторизованные API-запросы и ступенчато поднимает нагрузку 50 → 100 → 150 пользователей. Для корректного распределения желательно передать несколько тестовых сессий через запятую.

## Безопасный smoke-test

```bash
k6 run -e LOAD_PROFILE=smoke -e BASE_URL=https://staging.example.ru -e SESSION_COOKIES=token1,token2 tests/load/club-150.js
```

## Полный тест после увеличения VPS

```bash
k6 run -e BASE_URL=https://club2.myn8nservertest.ru -e CONFIRM_PRODUCTION_LOAD=YES -e SESSION_COOKIES=token1,token2,token3 tests/load/club-150.js
```

Нельзя запускать полный профиль на текущем VPS 2 vCPU / 2 ГБ: он предназначен для проверки конфигурации 8 vCPU / 16 ГБ. Production-защита требует явный `CONFIRM_PRODUCTION_LOAD=YES`.

Критерии прохождения: меньше 0,5% HTTP-ошибок, p95 ниже 500 мс и p99 ниже 1,5 с. Отдельно во время теста проверяются память контейнеров, соединения PostgreSQL и доставка сообщений в двух реальных PWA-клиентах.
