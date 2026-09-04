/**
 * Yerel SQLite şeması — sürümlü migration listesi.
 *
 * Kural: yayınlanmış bir migration DEĞİŞTİRİLMEZ, yenisi eklenir. Sürüm `user_version`
 * pragma'sında tutulur; uygulama açılışta eksik migration'ları sırayla uygular.
 *
 * Tablolar iki gruba ayrılır:
 *  - **cache** (`products`, `product_barcodes`, `settings_cache`): sunucudan gelen, POS'un
 *    ASLA yazmadığı ayna. Sync silip yeniden yazabilir.
 *  - **yerel** (`local_sales`, `local_sale_items`, `local_payments`, `sync_queue`,
 *    `sessions`): POS'un tek doğruluk kaynağı olduğu, kaybı kabul edilemez veri.
 *
 * Para ve miktar TEXT olarak saklanır — SQLite REAL float'tır, para float ile tutulmaz
 * (CLAUDE.md). Tarihler ISO 8601 UTC string.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — ilk şema
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- ---- cache (salt okunur ayna) ----
  CREATE TABLE products (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    sale_price     TEXT NOT NULL,
    vat_rate       INTEGER NOT NULL,
    stock_quantity TEXT NOT NULL,
    track_stock    INTEGER NOT NULL,
    is_active      INTEGER NOT NULL,
    unit_id        TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX idx_products_name ON products(name);

  CREATE TABLE product_barcodes (
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    value      TEXT NOT NULL,
    PRIMARY KEY (product_id, value)
  );
  CREATE INDEX idx_product_barcodes_value ON product_barcodes(value);

  CREATE TABLE settings_cache (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- ---- yerel satış ----
  CREATE TABLE local_sales (
    id                     TEXT PRIMARY KEY,
    cash_session_id        TEXT NOT NULL,
    contact_id             TEXT,
    document_discount_rate TEXT,
    note                   TEXT,
    sold_at                TEXT NOT NULL,
    grand_total            TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
    receipt_no             TEXT,
    server_sale_id         TEXT,
    created_at             TEXT NOT NULL
  );
  CREATE INDEX idx_local_sales_status ON local_sales(status);

  CREATE TABLE local_sale_items (
    id            TEXT PRIMARY KEY,
    sale_id       TEXT NOT NULL REFERENCES local_sales(id) ON DELETE CASCADE,
    product_id    TEXT NOT NULL,
    name          TEXT NOT NULL,
    quantity      TEXT NOT NULL,
    unit_price    TEXT NOT NULL,
    vat_rate      INTEGER NOT NULL,
    discount_rate TEXT,
    line_total    TEXT NOT NULL,
    note          TEXT,
    sort_order    INTEGER NOT NULL
  );
  CREATE INDEX idx_local_sale_items_sale ON local_sale_items(sale_id);

  CREATE TABLE local_payments (
    id              TEXT PRIMARY KEY,
    sale_id         TEXT NOT NULL REFERENCES local_sales(id) ON DELETE CASCADE,
    method          TEXT NOT NULL,
    amount          TEXT NOT NULL,
    received_amount TEXT,
    reference       TEXT
  );
  CREATE INDEX idx_local_payments_sale ON local_payments(sale_id);

  -- ---- gönderim kuyruğu ----
  -- UNIQUE(entity, entity_id): aynı satış kuyruğa İKİ KEZ giremez. Sunucudaki
  -- clientSaleId benzersizliğiyle birlikte "tek kopya" garantisinin yerel yarısı.
  CREATE TABLE sync_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entity          TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    payload         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    last_error      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE (entity, entity_id)
  );
  CREATE INDEX idx_sync_queue_ready ON sync_queue(status, next_attempt_at);

  -- ---- çevrimdışı giriş için oturum önbelleği ----
  -- password_hash: scrypt (parolanın kendisi DEĞİL). token_blob: safeStorage ile
  -- şifrelenmiş access/refresh çifti — düz metin token diske yazılmaz.
  CREATE TABLE sessions (
    user_id              TEXT PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    full_name            TEXT NOT NULL,
    tenant_id            TEXT NOT NULL,
    permissions          TEXT NOT NULL,
    roles                TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    token_blob           BLOB,
    last_online_login_at TEXT NOT NULL,
    updated_at           TEXT NOT NULL
  );
  `,

  // 2 — park edilmiş satışlar (Faz 13)
  //
  // Park YERELDİR, sunucuya gitmez: kasiyer müşteriyi bir kenara alıp sıradakine
  // bakar, birkaç dakika sonra devam eder. Sunucudaki `POST /sales/park` bu iş için
  // ağ gerektirirdi; internet kesikken park edememek kasada kabul edilemez.
  // Yine de bellekte tutulmaz — uygulama çökerse bekleyen sepet kaybolmasın.
  `
  CREATE TABLE parked_sales (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    payload     TEXT NOT NULL,
    item_count  INTEGER NOT NULL,
    grand_total TEXT NOT NULL,
    parked_at   TEXT NOT NULL
  );
  CREATE INDEX idx_parked_sales_parked_at ON parked_sales(parked_at);
  `,
];
