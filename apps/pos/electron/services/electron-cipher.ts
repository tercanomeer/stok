import { safeStorage } from 'electron';

import type { SecretCipher } from './secure-store';

/**
 * İşletim sisteminin anahtarlığına dayanan şifreleyici (Windows DPAPI / macOS Keychain).
 *
 * `isEncryptionAvailable()` false dönebilir (ör. anahtarlığı olmayan bir Linux masaüstü).
 * O durumda token diske hiç yazılmaz — bkz. `SessionTokenStore`.
 */
export const electronCipher: SecretCipher = {
  get available(): boolean {
    return safeStorage.isEncryptionAvailable();
  },
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (blob) => safeStorage.decryptString(blob),
};
