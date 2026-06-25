# Autoinstructor Calendar

Минимальная основа MVP системы записи к автоинструктору.

## Стек

- Next.js App Router
- TypeScript
- Supabase
- Tailwind CSS

## Запуск

1. Создайте проект в Supabase.
2. Скопируйте `.env.example` в `.env.local`.
3. Добавьте URL проекта и publishable key.
4. Выполните SQL из `supabase/migrations/20260620000000_initial_schema.sql`.
5. Выполните SQL из `supabase/seed.sql`.
6. Установите зависимости и запустите проект:

```bash
pnpm install
pnpm dev
```

## Структура

```text
src/
├── app/                    # Next.js App Router
└── lib/supabase/
    ├── client.ts           # браузерный Supabase-клиент
    └── server.ts           # серверный Supabase-клиент

supabase/
├── migrations/             # SQL-схема базы
└── seed.sql                # базовые типы занятий
```

## Демо-импорт расписания из Google Sheets

Скрипт `scripts/import-instructor-sheet-demo.ts` читает значения и цвета
ячеек через Google Sheets API, создаёт отдельного публичного инструктора со
slug `demo-sheet-import` и импортирует его расписание в Supabase.

Повторный запуск безопасен: перед импортом удаляются только `schedule_days`
инструктора `demo-sheet-import`. Его слоты и записи удаляются каскадно.
Расписание других инструкторов скрипт не изменяет.

### Настройка Google Cloud

1. Создайте или выберите проект в Google Cloud Console.
2. Включите
   [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com).
3. Создайте service account в IAM & Admin.
4. Создайте для него
   [JSON key](https://cloud.google.com/iam/docs/keys-create-delete).
5. Скопируйте из JSON поля `client_email` и `private_key` в `.env.local`.
6. Откройте Google Таблицу и выдайте доступ «Читатель» адресу
   `client_email` service account.

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=16DfYKRXzHtgOJS8JLsAqAJ3VRkSNAVU7nwEnEVDpI94
GOOGLE_SHEETS_GID=0
GOOGLE_SHEETS_IMPORT_YEAR=2026
GOOGLE_SHEETS_IMPORT_TIMEZONE=Asia/Irkutsk
```

Для записи в Supabase также нужны:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
```

### Запуск

```bash
pnpm install
pnpm import:sheet-demo
```

После завершения скрипт выводит количество найденных недель, дней, слотов,
записей, пропущенных ячеек и неизвестных цветов.

### Цвета

- оранжевый — `Автошкола OMG`;
- зелёный — `Главная дорога`;
- белый — `Дополнительное вождение`;
- фиолетовый — `Подарочное занятие`;
- красный и чёрный — слот не создаётся;
- жёлтый — заголовок недели.

### Очистка demo-данных

Следующий SQL удаляет только demo-инструктора и все связанные с ним дни,
слоты, записи, настройки и capabilities:

```sql
delete from public.instructors
where slug = 'demo-sheet-import';
```

Созданные demo-типы занятий можно при необходимости удалить отдельно:

```sql
delete from public.lesson_types
where code in (
  'demo_sheet_omg',
  'demo_sheet_main_road',
  'demo_sheet_extra_driving',
  'demo_sheet_gift'
);
```

## Демо-импорт расписания из Excel

Файл `data/instructor-schedule.xlsx` читается напрямую через `exceljs`.
Google Sheets API, OCR и скриншоты для импорта не используются.

Скрипт создаёт или использует обычного публичного инструктора:

- slug: `ivanov-ivan`;
- имя: `Иванов Иван`;
- публичное имя: `Иванов Иван`;
- базовое описание: `Инструктор по практическому вождению.`;
- capability: `driving`.

Если инструктор уже существует, скрипт использует его профиль без
перезаписывания `photo_url`, `short_bio`, `contact_text`, `car_description`,
`experience_text`, имени и других настроек. Кодовое слово также сохраняется.

Перед повторным импортом удаляются только `schedule_days` инструктора
`ivanov-ivan`. Связанные slots и bookings удаляются каскадно. Сам профиль и
данные других инструкторов не изменяются.

### Настройка

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
EXCEL_IMPORT_YEAR=2026
EXCEL_IMPORT_TIMEZONE=Asia/Irkutsk
EXCEL_IMPORT_FILE=data/instructor-schedule.xlsx
EXCEL_IMPORT_TARGET_INSTRUCTOR_SLUG=main-instructor
EXCEL_IMPORT_CLEAR_TARGET=false
```

### Запуск Excel-импорта

```bash
pnpm import:excel-demo
```

Проверить разбор файла без записи в Supabase:

```bash
pnpm import:excel-demo -- --dry-run
```

Скрипт импортирует стандартные и дополнительные 90-минутные строки, создаёт
свободные слоты для пустых рабочих ячеек и confirmed booking для ячеек с
именами. Неизвестные цвета выводятся в итоговом отчёте и пропускаются.

Скрипт не создаёт профиль инструктора и не перезаписывает его публичные поля.
По умолчанию target — `main-instructor`. Существующее расписание не удаляется.
Полная очистка target выполняется только при явном
`EXCEL_IMPORT_CLEAR_TARGET=true`.

## Перенос старого Excel-расписания на main-instructor

Сначала выполните безопасный аудит:

```bash
pnpm migrate:excel-to-main:dry
```

Dry-run показывает source/target counts, remap типов занятий, конфликты
слотов и точный SQL для ручного удаления мешающих старых target-слотов.

После устранения всех конфликтов:

```bash
pnpm migrate:excel-to-main
```

Apply сначала копирует и проверяет дни, слоты и bookings. Только после успешной
проверки удаляется расписание `demo-excel-import`, профиль скрывается и
деактивируется, а membership `test@test.com` отключается. Auth user не
удаляется.

### Очистка импортированного расписания

```sql
delete from public.schedule_days
where instructor_id = (
  select id
  from public.instructors
  where slug = 'ivanov-ivan'
);
```

Профиль `ivanov-ivan` при такой очистке сохраняется. Его фотографию, описание,
контакты, автомобиль, опыт, публичность и кодовое слово можно безопасно
редактировать в админке — повторный импорт их не затронет.

При необходимости demo-типы можно удалить отдельно после очистки расписания:

```sql
delete from public.lesson_types
where code in (
  'demo_excel_omg',
  'demo_excel_main_road',
  'demo_excel_extra',
  'demo_excel_gift'
);
```
