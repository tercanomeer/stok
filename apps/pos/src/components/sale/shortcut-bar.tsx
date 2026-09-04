import { memo, type ReactElement } from 'react';

import { SHORTCUTS, type SaleAction } from '../../lib/shortcuts';

interface ShortcutBarProps {
  onAction: (action: SaleAction) => void;
  disabled: ReadonlySet<SaleAction>;
}

/**
 * Alt kısayol şeridi.
 *
 * Kasada eğitim yoktur: yeni kasiyer tuşları buradan öğrenir. Düğmeler aynı işi
 * fareyle de yapar, ama etiket her zaman TUŞU söyler — amaç kasiyeri klavyeye
 * alıştırmak.
 */
export const ShortcutBar = memo(function ShortcutBar({
  onAction,
  disabled,
}: ShortcutBarProps): ReactElement {
  return (
    <nav
      aria-label="Kısayollar"
      className="border-border bg-surface-raised flex items-center gap-1 overflow-x-auto border-t px-2 py-1.5"
    >
      {SHORTCUTS.map((shortcut) => (
        <button
          key={shortcut.key}
          type="button"
          disabled={disabled.has(shortcut.action)}
          onClick={() => {
            onAction(shortcut.action);
          }}
          className="rounded-control hover:bg-surface-sunken focus-visible:outline-brand flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-sm focus-visible:outline-2 disabled:opacity-40"
        >
          <kbd className="bg-surface-sunken text-ink-muted rounded px-1.5 py-0.5 font-mono text-xs">
            {shortcut.key}
          </kbd>
          <span className="text-ink">{shortcut.label}</span>
        </button>
      ))}
    </nav>
  );
});
