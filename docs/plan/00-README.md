# Stokk — Proje Planı

**Stokk**, Türkiye pazarına yönelik **bulut tabanlı + offline-first** SaaS POS sistemidir.
Market / bakkal / tekel / nalbur / pet shop işletmeleri için barkodlu satış, stok, cari, finans,
raporlama ve e-fatura süreçlerini tek çatı altında toplar.

Bu klasör (`docs/plan/`) projenin **sıfırdan kurulum planıdır**. Tek satır kod yazılmadan önce
hazırlandı; Faz 0'dan başlanır, fazlar sırayla ilerler.

## Dosyalar

| #   | Dosya                                            | İçerik                                                                  |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| —   | [`CLAUDE.md`](../../CLAUDE.md)                   | Claude Code'un her oturumda okuduğu proje talimatı. Kök dizinde durur   |
| 01  | [`01-proje.md`](./01-proje.md)                   | Vizyon, hedef kullanıcı, kapsam, iş kuralları, sözlük                   |
| 02  | [`02-teknoloji.md`](./02-teknoloji.md)           | Teknoloji seçimleri, sürümler, gerekçeler, elenen alternatifler         |
| 03  | [`03-mimari.md`](./03-mimari.md)                 | Monorepo yapısı, paketler, API sözleşmesi, auth, offline sync, güvenlik |
| 04  | [`04-fazlar.md`](./04-fazlar.md)                 | Faz 0–15: yapılacak işler, kullanılacak ajanlar, doğrulama adımları     |
| 05  | [`05-skills-ajanlar.md`](./05-skills-ajanlar.md) | Skill ve subagent kataloğu, ne zaman hangisi kullanılır                 |

## Üç uygulama, tek backend

| Uygulama                | Kim kullanır       | Nerede                                                           |
| ----------------------- | ------------------ | ---------------------------------------------------------------- |
| `@stokk/pos` — Electron | Kasiyer            | Kasa önü Windows PC. Donanım erişimi + internet kesilse de satış |
| `@stokk/web` — Next.js  | İşveren / yönetici | Tarayıcı. Yönetim, stok, cari, rapor                             |
| `@stokk/api` — NestJS   | —                  | Sunucu. Tüm iş mantığı ve veri                                   |

## Yol haritası özeti

| Faz | Konu                                                    | Tahmini |
| --- | ------------------------------------------------------- | ------- |
| 0   | Monorepo, altyapı, CI, test iskeleti                    | 2–3 gün |
| 1   | Veri modeli, migration, seed                            | 3–4 gün |
| 2   | Auth, tenant izolasyonu, yetki                          | 4–5 gün |
| 3   | Katalog & ürün backend                                  | 4–5 gün |
| 4   | Stok backend                                            | 3–4 gün |
| 5   | Cari & alış faturası backend                            | 4–5 gün |
| 6   | Kasa, vardiya, satış backend + `pos-core`               | 5–7 gün |
| 7   | Gelir/gider, raporlar, export, e-fatura adapter         | 4–5 gün |
| 8   | Tasarım sistemi + web panel iskeleti + auth ekranları   | 4–5 gün |
| 9   | Web: ürün & stok ekranları                              | 4–5 gün |
| 10  | Web: cari, alış, finans ekranları                       | 3–4 gün |
| 11  | Web: satış, rapor, e-fatura, kullanıcı, ayarlar         | 4–5 gün |
| 12  | Electron iskelet, offline SQLite, sync motoru           | 5–7 gün |
| 13  | POS satış ekranı                                        | 5–7 gün |
| 14  | Donanım: yazıcı, terazi, müşteri ekranı, banka POS, ÖKC | 4–6 gün |
| 15  | SaaS abonelik + production deploy + izleme              | 4–6 gün |

**Toplam:** ~60–80 iş günü (tek geliştirici, AI destekli). Fazlar arası sıra bağlayıcıdır:
her ekranın backend'i kendinden önceki fazda hazır olur.
