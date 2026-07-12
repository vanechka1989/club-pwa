# Expanded Theme System Design

**Дата:** 2026-07-12  
**Статус:** утверждён пользователем для реализации  
**Источник требований:** визуальный аудит проекта и команда пользователя «Делай»

## Цель

Добавить в Club PWA три визуально отличимые дизайн-темы — Pine Teal, Warm Clay и Plum Rose — с независимыми светлым и тёмным режимами. Одновременно устранить смешение нового foundation-слоя со старыми `--surface*`, `--ds-*` и RGB-переменными, не меняя бизнес-логику, маршруты, API, роли, платежи, чат, поддержку и PWA-поведение.

Готовый интерфейс должен сохранять текущую компактную геометрию, но отчётливо разделять фон приложения, страницу, карточки, поля, elevated-поверхности и активную навигацию.

## Диагноз

Сейчас приложение поддерживает две дизайн-темы (`dark-soft-touch` и `graphite-electric-blue`) и два независимых режима (`light` и `dark`). Обе темы используют близкие холодные сине-графитовые нейтрали, поэтому отличаются преимущественно оттенком primary.

Тематический каскад разделён между несколькими поколениями переменных:

- `--color-*` в `features/ui/foundation.css`;
- `--panel*` и `--bg` как совместимые aliases;
- `--surface*`, `--ds-*`, `--ds-primary-rgb` и `--ds-blue-rgb` в `styles.css`;
- старые `data-scheme` палитры, хотя store принудительно использует `midnight`;
- локальные градиенты и тени, читающие старые RGB-переменные.

Из-за этого часть компонентов использует новую палитру, а часть — старую. Контраст между уровнями поверхности в текущих темах находится примерно в диапазоне 1.05–1.10:1, а границы карточек — 1.26–1.35:1, поэтому блоки визуально сливаются.

## Рассмотренные подходы

### 1. Дописать новые selectors в конец CSS

Самый быстрый вариант, но он добавит ещё один override-слой и потребует дублировать `--color-*`, `--panel*`, `--surface*`, `--ds-*` и RGB-токены для каждой темы. Подход отклонён из-за высокой вероятности новых расхождений.

### 2. Полностью очистить и переписать `styles.css`

Дал бы чистую архитектуру, но затронул бы тысячи существующих правил и множество экранов. Это непропорциональный риск для задачи добавления тем.

### 3. Foundation-first темы с compatibility aliases

Выбранный вариант. Новые палитры определяются один раз через полный набор semantic tokens в `foundation.css`. В этом же слое старые переменные перенаправляются на semantic tokens, а RGB-каналы задаются явно для каждого сочетания design theme и режима. Старые экранные классы продолжают работать, но получают те же цвета, что и foundation-компоненты.

## Контракт состояния

Тип `DesignTheme` расширяется до пяти значений:

```ts
export type DesignTheme =
  | "dark-soft-touch"
  | "graphite-electric-blue"
  | "pine-teal"
  | "warm-clay"
  | "plum-rose";
```

`Theme` остаётся `"dark" | "light"`. Режим и дизайн-тема сохраняются независимо под существующими ключами `club-theme` и `club-design-theme`.

При чтении storage принимаются только пять известных design theme. Неизвестные и устаревшие значения безопасно мигрируют в `dark-soft-touch`. Выбранная тема применяется через существующий `data-design-theme` на `<html>`.

## Семантические токены

Каждая из десяти комбинаций design theme × mode обязана задавать полный набор:

- `--color-bg`;
- `--color-page`;
- `--color-surface`;
- `--color-surface-elevated`;
- `--color-surface-soft`;
- `--color-text`;
- `--color-text-muted`;
- `--color-text-subtle`;
- `--color-border`;
- `--color-border-strong`;
- `--color-primary`;
- `--color-primary-strong`;
- `--color-primary-text`;
- `--color-primary-rgb`;
- `--color-support-rgb`;
- `--color-focus`;
- status, disabled и shadow tokens.

Compatibility aliases задаются один раз и всегда ссылаются на semantic tokens:

```css
--bg: var(--color-bg);
--surface: var(--color-surface);
--surface-2: var(--color-surface-elevated);
--surface-3: var(--color-surface-soft);
--panel: var(--color-surface);
--panel-strong: var(--color-surface-elevated);
--panel-soft: var(--color-surface-soft);
--field: var(--color-surface-soft);
--border: var(--color-border);
--text: var(--color-text);
--muted: var(--color-text-muted);
--accent: var(--color-primary);
--ds-primary: var(--color-primary);
--ds-primary-rgb: var(--color-primary-rgb);
--ds-blue-rgb: var(--color-support-rgb);
```

Это правило распространяется и на существующие Dark Soft Touch и Graphite + Electric Blue. Геометрия компонентов не меняется.

## Палитры

### Pine Teal

Тихая хвойная палитра с бирюзовым primary. Primary не совпадает с зелёным success.

| Token | Dark | Light |
|---|---|---|
| bg | `#06110D` | `#EDF5F0` |
| page | `#0A1915` | `#F7FBF8` |
| surface | `#10251C` | `#FFFFFF` |
| surfaceElevated | `#18372A` | `#EEF6F1` |
| surfaceSoft | `#0C1E17` | `#E4F0E9` |
| text | `#F3FBF6` | `#102018` |
| textMuted | `#A6B8AE` | `#5F7268` |
| textSubtle | `#829A8E` | `#71857A` |
| border | `#315D49` | `#C5D8CD` |
| borderStrong | `#477863` | `#A8C2B3` |
| primary | `#2DD4BF` | `#0F766E` |
| primaryStrong | `#5EEAD4` | `#115E59` |
| primaryText | `#042F2E` | `#FFFFFF` |
| focus | `#5EEAD4` | `#0D9488` |

### Warm Clay

Тёплая песочно-глиняная палитра для профиля, оплаты и премиального клубного ощущения. Orange primary остаётся отличимым от amber warning.

| Token | Dark | Light |
|---|---|---|
| bg | `#120D09` | `#F2ECE4` |
| page | `#1B130E` | `#F8F1E8` |
| surface | `#251A13` | `#FFFDFC` |
| surfaceElevated | `#33251B` | `#FFFFFF` |
| surfaceSoft | `#1E160F` | `#F3E7DA` |
| text | `#FFF8F0` | `#251A13` |
| textMuted | `#C2AA96` | `#715D4C` |
| textSubtle | `#9E8876` | `#89715E` |
| border | `#5C4433` | `#D4C1AE` |
| borderStrong | `#795C46` | `#BDA58F` |
| primary | `#FB923C` | `#C2410C` |
| primaryStrong | `#FDBA74` | `#9A3412` |
| primaryText | `#2A1200` | `#FFFFFF` |
| focus | `#FDBA74` | `#EA580C` |

### Plum Rose

Эмоциональная сливово-розовая тема для сообщества и персонального пространства. Rose primary остаётся отделённым от danger red.

| Token | Dark | Light |
|---|---|---|
| bg | `#100812` | `#F4EDF5` |
| page | `#190D1D` | `#FAF5FB` |
| surface | `#251328` | `#FFFFFF` |
| surfaceElevated | `#351C39` | `#FFFAFF` |
| surfaceSoft | `#201024` | `#F1E5F3` |
| text | `#FFF5FE` | `#2A142D` |
| textMuted | `#C4ABC5` | `#735B75` |
| textSubtle | `#9F85A2` | `#896C8C` |
| border | `#65416B` | `#D3BED5` |
| borderStrong | `#83558A` | `#BA9DBE` |
| primary | `#F472B6` | `#A21CAF` |
| primaryStrong | `#F9A8D4` | `#86198F` |
| primaryText | `#310A22` | `#FFFFFF` |
| focus | `#F9A8D4` | `#C026D3` |

### RGB-каналы градиентов

RGB-каналы задаются явно, чтобы старые gradients и shadows не сохраняли акцент другой темы:

| Theme | Dark primary / support | Light primary / support |
|---|---|---|
| Dark Soft Touch | `108 140 255` / `139 92 246` | `47 111 236` / `124 58 237` |
| Graphite + Electric Blue | `59 130 246` / `56 189 248` | `37 99 235` / `2 132 199` |
| Pine Teal | `45 212 191` / `56 189 248` | `15 118 110` / `14 116 144` |
| Warm Clay | `251 146 60` / `245 158 11` | `194 65 12` / `180 83 9` |
| Plum Rose | `244 114 182` / `167 139 250` | `162 28 175` / `126 34 206` |

## Статусы и доступность

Семантика status colors не меняется между дизайн-темами:

- success — зелёный;
- warning — янтарный;
- danger — красный;
- info — голубой.

В тёмном режиме допускаются более светлые status tones и тёмный текст на ярком фоне. В светлом режиме используются более тёмные tones с белым текстом. Цвет не является единственным индикатором: существующие подписи, иконки и статусы сохраняются.

Контраст обычного текста и текста основных кнопок должен быть не ниже 4.5:1. Границы интерактивных полей должны оставаться различимыми в normal, hover, focus, disabled и error состояниях. Для Graphite Dark `--color-primary-text` меняется с белого на тёмный, чтобы текст на electric blue проходил AA.

## Фоны, карточки и навигация

Новые темы не меняют layout и размеры. Изменения ограничены токенами и тематическими previews.

- фон приложения использует `--color-bg` и мягкие gradients через тематические RGB-каналы;
- page shell использует `--color-page`;
- основные карточки используют `--color-surface`;
- modals, drawers и всплывающие панели используют `--color-surface-elevated`;
- поля, segmented controls и secondary regions используют `--color-surface-soft`;
- bottom navigation получает elevated surface, strong border и existing shadow;
- выбранный nav item использует primary soft tint, primary icon/text и существующий визуальный индикатор;
- полный primary background применяется только к главным CTA.

Новые темы не добавляют glow к каждой карточке и не используют цвет как замену spacing или typography hierarchy.

## Переключатель тем

Блок «Темы» в профиле показывает пять карточек в текущем порядке:

1. Dark Soft Touch Premium;
2. Graphite + Electric Blue;
3. Pine Teal;
4. Warm Clay;
5. Plum Rose.

Каждая карточка получает локализованные label и description, четырёхцветный preview, `aria-pressed`, selected check и существующие focus/press states. На мобильном карточки остаются одной колонкой; на широкой поверхности допускается существующая responsive grid.

## Тестирование

Реализация следует TDD.

1. Store unit tests сначала фиксируют пять допустимых design theme, сохранение, восстановление, независимость от light/dark и fallback неизвестного storage value.
2. Component/source tests сначала требуют пять options, локализованные строки и preview classes.
3. Design-system tests сначала требуют полный набор selectors и compatibility aliases, включая RGB tokens.
4. Contrast tests вычисляют WCAG ratio для primary/primaryText и text/surface каждой новой темы, а также исправленного Graphite Dark.
5. Playwright переключает каждую тему в обоих режимах, проверяет `data-design-theme`, вычисленные `--bg`, `--surface`, `--primary`, отсутствие horizontal overflow и сохранение после reload.
6. Visual review охватывает профиль, модули и общение минимум на `390x844` и `1440x900`; дополнительные route audits подтверждают оплату, поддержку и админку.

## Ограничения объёма

В эту работу не входят:

- полная очистка всего `styles.css`;
- изменение геометрии экранов и foundation-компонентов;
- новая high-contrast тема;
- возврат старого пользовательского переключателя `data-scheme`;
- изменение status copy, иконок, типографики, бизнес-логики или данных;
- деплой на production без отдельного прямого запроса пользователя.

## Критерии готовности

- все пять design theme доступны в профиле;
- каждая тема работает независимо в light и dark;
- выбор сохраняется после reload;
- старые и новые компоненты получают согласованные semantic colors;
- новые темы визуально различаются температурой нейтралей и primary hue;
- текст и primary controls проходят WCAG AA;
- нет новых horizontal overflow, console errors и regressions существующих маршрутов;
- проходят unit tests, typecheck, build и целевые Playwright проверки;
- свежие screenshots просмотрены в mobile и desktop viewport.
