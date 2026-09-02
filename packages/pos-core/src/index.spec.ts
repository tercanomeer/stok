import { describe, expect, it } from 'vitest';

import { POS_CORE_CONTRACT_VERSION } from './index';

describe('@stokk/pos-core', () => {
  it('sözleşme sürümünü dışa veriyor', () => {
    expect(POS_CORE_CONTRACT_VERSION).toBe(1);
  });
});
