# Task 7 — final implementer report

## Статус

DONE. Findings из финального re-review закрыты в `d028261` (`b560558..d028261`). Развёртывание не выполнялось.

## Финальные исправления

- OOXML policy структурно разбирает все `Default`/`Override` declarations, вычисляет effective content type каждого package part и применяет allowlist по типу Office-документа. Relationship types также ограничены по kind; `aFChunk`, attached templates, OLE/package/external-link imports, macro-enabled, executable, HTML/XHTML, SVG, script, RTF и RFC822 payloads отклоняются независимо от расширения. Добавлен отрицательный `.dat`/`text/html` `aFChunk` fixture.
- Canonical finalize replay сверяет полный set attachment IDs исходного сообщения с полным set manifests запроса. Полный и переставленный наборы принимаются; subset, superset и overlapping наборы отклоняются. Manifest locks берутся в нормализованном порядке.
- Media worker сохраняет точный `updatedAt` полученной lease и использует status+timestamp CAS как для success, так и для failure. Потерявший lease worker не обновляет manifest/attachment и не удаляет объекты текущего worker; тесты покрывают late success и late failure.
- Ранее закрытые исправления сохранены: атомарное создание media-message с permission/reply/kind/expiry/replay rules, 15-минутный attachment grace, cleanup unattached manifests, attachment-gated processing/scanning, scanner lease fencing и structured AWS `NoSuchUpload` reconciliation.

## Проверка

- Focused Task 7 API suite (10 files): **62 passed**.
- `pnpm test`: **shared 61 passed; API 715 passed, 17 skipped; web 885 passed**.
- `pnpm check`: **shared/API/web passed**.
- `git diff --check`: **passed**.
- Real PostgreSQL/S3 tests и live Docker/ClamAV qualification не запускались: требуемая внешняя инфраструктура в окружении отсутствует.

## Эксплуатационные условия

- До production требуется применить `0065_community_upload_manifests.sql`, настроить lifecycle обоих buckets, выполнить gated PostgreSQL/S3 suites и ClamAV/Compose smoke gate из `docs/operations/community-uploads.md`.
