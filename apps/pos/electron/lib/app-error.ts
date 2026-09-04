/**
 * Kullanıcıya GÖSTERİLEBİLİR hata: kodu ve Türkçe mesajı IPC üzerinden renderer'a geçer.
 * Bu sınıftan türemeyen hatalar renderer'a genel bir mesajla döner (iç detay sızmasın).
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Donanım kanalları Faz 14'te doldurulacak — şimdilik açıkça "hazır değil" der. */
export class NotImplementedError extends AppError {
  constructor(what: string) {
    super('NOT_IMPLEMENTED', `${what} desteği bu sürümde henüz yok.`);
  }
}
