import { describe, expect, it } from 'vitest';

import { UI_STYLES_ENTRY } from './index';

describe('@stokk/ui', () => {
  it('stil giriş noktasını dışa veriyor', () => {
    expect(UI_STYLES_ENTRY).toBe('@stokk/ui/styles.css');
  });
});
