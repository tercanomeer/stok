import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('metni ve varsayılan type=button ile render eder', () => {
    render(<Button>Kaydet</Button>);
    const btn = screen.getByRole('button', { name: 'Kaydet' });
    expect(btn).toHaveProperty('type', 'button');
  });

  it('loading iken devre dışı ve aria-busy', () => {
    render(<Button loading>Kaydet</Button>);
    const btn = screen.getByRole('button', { name: 'Kaydet' });
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });
});
