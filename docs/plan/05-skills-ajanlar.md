# 05 — Skill'ler ve Ajanlar

Bu proje Claude Code ile geliştirilecek. Bu dosya, hangi işte hangi aracın kullanılacağını tanımlar.

## Temel kural

**Faz ajanları otomatiktir.** `04-fazlar.md` içinde her fazın "Kullanılacak ajanlar" tablosu vardır;
bu tablo o fazın tamamlanma koşuludur ve kullanıcı ayrıca istemese de çalıştırılır. Zamanlaması:
doğrulama komutları geçtikten sonra, faz notları yazılmadan önce.

Faz tablosu dışında da ajan çağrılabilir — üç durumda:

1. **Uzmanlık gerektiren dar bir iş** — güvenlik denetimi, sorgu planı analizi, erişilebilirlik kontrolü
2. **Geniş arama** — cevabı bulmak için çok sayıda dosyayı taramak gerekiyorsa
3. **Bağımsız paralel iş** — birbirini beklemeyen birden fazla iş varsa

Sıradan kodlama işi ajana devredilmez; doğrudan yapmak daha hızlı ve ucuzdur.
**Workflow (çok ajanlı orkestrasyon) yalnızca kullanıcı açıkça isterse çalıştırılır** — faz ajanları buna dahil değildir.

Kullanıcı bir fazda "ajanları atla" derse atlanır ve bu durum `.ai-context/faz-N-notes.md` içine yazılır.

## Skill'ler

Skill'ler `/isim` şeklinde çağrılır ve bir iş akışını yükler.

| Skill                      | Ne yapar                                                                                       | Ne zaman                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `/run`                     | Uygulamayı gerçekten ayağa kaldırır ve sürer (sadece başlatmaz — tıklar, ekran görüntüsü alır) | Her faz doğrulamasında; özellikle Faz 8–14'te ekran ve POS uygulaması için |
| `/code-review`             | Değişen kodu doğruluk ve sadelik açısından inceler                                             | Her fazın sonunda, commit öncesi                                           |
| `/security-review`         | Bekleyen değişikliklerde güvenlik incelemesi                                                   | Faz 2 (auth), Faz 12 (Electron), Faz 15 (production) — zorunlu             |
| `/simplify`                | Tekrar eden kodu ortaklaştırır, gereksiz karmaşıklığı alır                                     | Faz 9–11 arası tablo/form tekrarları biriktiğinde                          |
| `frontend-design`          | Görsel yön, tipografi, şablon görünümünden kaçınma                                             | Faz 8 tasarım dili kurulurken, Faz 13 satış ekranı düzeninde               |
| `dataviz`                  | Grafik/dashboard tasarım sistemi: renk, eksen, etkileşim kuralları                             | Faz 7 (rapor veri şekli), Faz 8 (dashboard), Faz 11 (rapor ekranları)      |
| `/init`                    | Kök `CLAUDE.md` üretir/günceller                                                               | Faz 0'da; sonra elle güncellenir                                           |
| `update-config`            | `settings.json`: izinler, hook'lar, ortam değişkenleri                                         | Faz 0'da pre-commit ve izin ayarları                                       |
| `fewer-permission-prompts` | Sık kullanılan güvenli komutları izin listesine ekler                                          | Faz 0 sonrası, izin sorusu yormaya başladığında                            |
| `claude-in-chrome`         | Tarayıcıyı sürer: tıklama, form doldurma, konsol okuma                                         | Faz 8–11 ekran akışlarının doğrulanması                                    |
| `/loop`, `/schedule`       | Tekrarlayan/zamanlanmış işler                                                                  | Uzun CI veya deploy izleme (opsiyonel)                                     |

## Ajanlar

### Genel amaçlı

| Ajan              | Ne için                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `Plan`            | Bir fazın uygulama sırasını ve kritik dosyalarını çıkarmak. Faz başlangıçlarında         |
| `Explore`         | Geniş kod araması — "bu kural nerede uygulanıyor" tipi sorular. Kod büyüdükçe değerlenir |
| `general-purpose` | Çok adımlı, kendi başına yürüyen araştırma işleri                                        |

### Kalite & güvenlik (`voltagent-qa-sec:*`)

| Ajan                                         | Ne için                                                              | Fazlar                       |
| -------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `architect-reviewer`                         | Modül sınırları, paket bağımlılıkları, mimari kararların tutarlılığı | 0, 1, 12                     |
| `code-reviewer`                              | Kod kalitesi, hata yönetimi, tekrar                                  | 3, 4, 5, 8, 9, 10, 14        |
| `security-auditor`                           | Sistematik güvenlik denetimi, yetki ve veri sızıntısı                | 2, 6, 7, 11, 12, 15          |
| `penetration-tester`                         | Aktif deneme: tenant sınırı, token, rate limit, IDOR                 | 2, 15                        |
| `test-automator`                             | Test altyapısı ve otomatik test yazımı                               | 0, 2, 3, 4, 5, 6, 10, 12, 13 |
| `qa-expert`                                  | Test senaryosu matrisi, kenar durum listesi                          | 6, 13, 14                    |
| `debugger`                                   | Kök neden analizi — tutarsız bakiye, native modül, seri port         | 5, 12, 14                    |
| `error-detective`                            | Hata korelasyonu, saha hatalarının anlamlandırılması                 | 14, 15                       |
| `performance-engineer`                       | Darboğaz avı: satış gecikmesi, render bütçesi, rapor süresi          | 6, 7, 9, 13, 15              |
| `ui-ux-tester`                               | Belgelenmiş akışların gerçek arayüzde sürülmesi                      | 8, 9, 10, 11, 13             |
| `accessibility-tester`                       | Klavye gezinme, odak, kontrast                                       | 8, 9, 11                     |
| `compliance-auditor`, `gdpr-ccpa-compliance` | KVKK / veri koruma gereklilikleri                                    | 15                           |
| `chaos-engineer`                             | Servis düştüğünde davranış, kurtarma provası                         | 15                           |

### Veri (`voltagent-data-ai:*`)

| Ajan                 | Ne için                                                    | Fazlar  |
| -------------------- | ---------------------------------------------------------- | ------- |
| `postgres-pro`       | Şema tasarımı, kısıtlar, kilitleme, sequence stratejisi    | 1, 4, 6 |
| `database-optimizer` | Yavaş sorgu analizi, indeks ve materialized view kararları | 1, 3, 7 |
| `data-analyst`       | Rapor metriklerinin tanımı ve okunabilirliği               | 7, 11   |

## Faz → araç haritası

| Faz                          | Ajanlar                                                                                        | Skill'ler                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0 — Altyapı                  | Plan, test-automator, architect-reviewer                                                       | `/run`, `update-config`, `/init`                         |
| 1 — Veri modeli              | postgres-pro, database-optimizer, architect-reviewer                                           | `/code-review`                                           |
| 2 — Auth & tenant            | security-auditor, penetration-tester, test-automator                                           | `/security-review`                                       |
| 3 — Ürün                     | code-reviewer, test-automator, database-optimizer                                              | `/code-review`                                           |
| 4 — Stok                     | postgres-pro, test-automator, code-reviewer                                                    | `/code-review`                                           |
| 5 — Cari & alış              | code-reviewer, debugger, test-automator                                                        | `/code-review`                                           |
| 6 — Satış & kasa             | test-automator, qa-expert, postgres-pro, performance-engineer, security-auditor                | `/code-review`                                           |
| 7 — Rapor & yasal            | database-optimizer, data-analyst, performance-engineer, security-auditor                       | `dataviz`                                                |
| 8 — Web iskelet              | ui-ux-tester, accessibility-tester, code-reviewer                                              | `frontend-design`, `dataviz`, `/run`, `claude-in-chrome` |
| 9 — Ürün & stok ekranları    | ui-ux-tester, performance-engineer, accessibility-tester, code-reviewer                        | `/run`, `/simplify`                                      |
| 10 — Cari & finans ekranları | ui-ux-tester, test-automator, code-reviewer                                                    | `/run`                                                   |
| 11 — Satış & rapor ekranları | data-analyst, ui-ux-tester, security-auditor, accessibility-tester                             | `dataviz`, `/code-review`                                |
| 12 — Electron iskelet        | architect-reviewer, security-auditor, debugger, test-automator                                 | `/run`, `/security-review`                               |
| 13 — POS satış ekranı        | performance-engineer, ui-ux-tester, test-automator, qa-expert                                  | `/run`, `frontend-design`                                |
| 14 — Donanım                 | debugger, qa-expert, error-detective, code-reviewer                                            | `/run`                                                   |
| 15 — SaaS & production       | security-auditor, penetration-tester, compliance-auditor, chaos-engineer, performance-engineer | `/security-review`, `/code-review`                       |

## Ajan çağırırken

- **Görevi dar tanımla.** "Auth modülüne bak" değil: "auth modülünde refresh token rotasyonunun eski token'ı gerçekten geçersizleştirdiğini doğrula, kaçak varsa dosya:satır ver."
- **Bağımsız işleri tek mesajda paralel başlat**, birbirine bağlı olanları sırayla.
- **Sonucu sorgula.** Ajan raporu bir bulgudur, kanıt değildir; kritik iddiayı kodda doğrula.
- **Aynı işi hem ajana verip hem kendin yapma.**
