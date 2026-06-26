DELETE FROM "content_categories"
WHERE "description" IS NULL
   OR LEFT("description", 15) <> '__club_module__';

WITH module_1 AS (
  INSERT INTO "content_categories" ("slug", "title", "description", "sort_order", "is_published")
  SELECT
    'module-1-seed',
    'Модуль 1',
    '__club_module__
Первый модуль клуба. Внутри будут уроки и материалы первого блока.',
    0,
    true
  WHERE NOT EXISTS (
    SELECT 1 FROM "content_categories" WHERE LEFT("description", 15) = '__club_module__'
  )
  RETURNING "id"
),
module_2 AS (
  INSERT INTO "content_categories" ("slug", "title", "description", "sort_order", "is_published")
  SELECT
    'module-2-seed',
    'Модуль 2',
    '__club_module__
Второй модуль клуба. Внутри будут уроки следующего блока.',
    1,
    true
  WHERE EXISTS (SELECT 1 FROM module_1)
  RETURNING "id"
),
seed_lessons AS (
  SELECT module_1."id" AS "category_id", 'text'::content_kind AS "kind", 'Вариант 1. Плеер и очередь' AS "title", 'Плеер, очередь просмотра и быстрый возврат к уроку.' AS "summary", 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.' AS "body", '/previews/learning-redesign-1.svg' AS "thumbnail_url", 0 AS "sort_order" FROM module_1
  UNION ALL
  SELECT module_1."id", 'text'::content_kind, 'Вариант 2. Модули и уроки', 'Модульная структура с уроками внутри каждого блока.', 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.', '/previews/learning-redesign-2.svg', 1 FROM module_1
  UNION ALL
  SELECT module_1."id", 'text'::content_kind, 'Вариант 3. Библиотека', 'Библиотечный вид для быстрого поиска нужного урока.', 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.', '/previews/learning-redesign-3.svg', 2 FROM module_1
  UNION ALL
  SELECT module_1."id", 'text'::content_kind, 'Вариант 4. Маршрут обучения', 'Маршрут прохождения с понятными шагами.', 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.', '/previews/learning-redesign-4.svg', 3 FROM module_1
  UNION ALL
  SELECT module_2."id", 'text'::content_kind, 'Верх экрана', 'Первый экран урока.', 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.', '/previews/admin-stats-preview-1.png', 0 FROM module_2
  UNION ALL
  SELECT module_2."id", 'text'::content_kind, 'Оплаты и контент', 'Экран с данными по оплатам и контенту.', 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.', '/previews/admin-stats-preview-2.png', 1 FROM module_2
  UNION ALL
  SELECT module_2."id", 'text'::content_kind, 'Общение', 'Экран с данными по общению.', 'Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.', '/previews/admin-stats-preview-3.png', 2 FROM module_2
)
INSERT INTO "content_items" (
  "category_id",
  "kind",
  "title",
  "summary",
  "body",
  "thumbnail_url",
  "sort_order",
  "is_published",
  "published_at"
)
SELECT
  "category_id",
  "kind",
  "title",
  "summary",
  "body",
  "thumbnail_url",
  "sort_order",
  true,
  now()
FROM seed_lessons;
