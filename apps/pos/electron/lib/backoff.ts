/**
 * Kuyruk yeniden deneme aralığı — üstel artış + jitter.
 *
 * Jitter şart: kasa açılışında biriken 40 satış aynı anda 5. saniyede tekrar denerse
 * sunucuya eş zamanlı dalga vurur. `±%20` rastgelelik dalgayı dağıtır.
 */
export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 300_000;
/** Bu sayıya ulaşan kayıt kalıcı hata kuyruğuna düşer, elle müdahale bekler. */
export const MAX_ATTEMPTS = 5;

export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, attempts - 1);
  const flat = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(flat * jitter);
}

/** `attempts` denemesinden sonra sıradaki denemenin ISO zamanı. */
export function nextAttemptAt(
  attempts: number,
  now: Date,
  random: () => number = Math.random,
): string {
  return new Date(now.getTime() + backoffMs(attempts, random)).toISOString();
}
