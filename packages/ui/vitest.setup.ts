import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Her testten sonra DOM'u temizle (globals kapalı; otomatik cleanup çalışmaz).
afterEach(() => {
  cleanup();
});
