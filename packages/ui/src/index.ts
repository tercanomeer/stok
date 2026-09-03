/**
 * @stokk/ui — web ve POS'un paylaştığı React primitive'leri + gösterim formatlayıcıları.
 *
 * Kural: yalnız iki uygulamada da kullanılan bileşen buraya girer;
 * tek uygulamaya özgü olan, uygulamanın kendi components/ klasöründe kalır (bkz. Faz 8 code-reviewer).
 */

export const UI_STYLES_ENTRY = '@stokk/ui/styles.css' as const;

// --- yardımcılar ---
export { cn } from './lib/cn.js';
export {
  formatMoney,
  formatQuantity,
  formatCount,
  formatPercent,
  formatDate,
  formatDateTime,
  formatTime,
  formatRelative,
} from './lib/format.js';

// --- bileşenler ---
export { Button, buttonVariants, type ButtonProps } from './components/button.js';
export { Input, type InputProps } from './components/input.js';
export { Label, type LabelProps } from './components/label.js';
export { Field, type FieldProps } from './components/field.js';
export { Select, type SelectProps } from './components/select.js';
export { Textarea, type TextareaProps } from './components/textarea.js';
export { Checkbox, type CheckboxProps } from './components/checkbox.js';
export { Card, CardHeader, CardTitle, CardDescription, CardBody } from './components/card.js';
export { Badge, type BadgeProps } from './components/badge.js';
export { Spinner, type SpinnerProps } from './components/spinner.js';
export {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  type CellProps,
  type TdProps,
} from './components/table.js';
export { Dialog, type DialogProps } from './components/dialog.js';
export { ToastProvider, useToast, type ToastTone } from './components/toast.js';
export { EmptyState, type EmptyStateProps } from './components/empty-state.js';
