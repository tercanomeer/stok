/**
 * İstemci ortam değişkenleri. Yalnız `NEXT_PUBLIC_*` tarayıcıya sızar (Next kuralı).
 * API kökü build-time inline edilir; verilmezse yerel geliştirme varsayılanı.
 */
export const API_URL: string = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
