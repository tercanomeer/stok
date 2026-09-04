import { useEffect, useRef, type ReactElement, useState } from 'react';

import { Button, Dialog, Field, Textarea } from '@stokk/ui';

interface NoteDialogProps {
  lineName: string;
  currentNote: string | null;
  onClose: () => void;
  onApply: (note: string | null) => void;
}

/**
 * Satır notu (F8) — "az pişmiş", "hediye paketi", "müşteri sonra alacak" gibi
 * fişe ve satış kaydına geçen serbest metin. Boş bırakılırsa not silinir.
 */
export function NoteDialog({
  lineName,
  currentNote,
  onClose,
  onApply,
}: NoteDialogProps): ReactElement {
  // Modal yalnız açıkken mount ediliyor; mevcut not doğrudan başlangıç değeri.
  const [note, setNote] = useState(currentNote ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // `autoFocus` yerine effect; bkz. discount-dialog.tsx'teki aynı not.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Satır notu — ${lineName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç (Esc)
          </Button>
          <Button
            onClick={() => {
              onApply(note.trim() === '' ? null : note.trim());
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <Field label="Not" hint="Fişe ve satış kaydına geçer.">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            value={note}
            ref={inputRef}
            rows={3}
            maxLength={200}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
