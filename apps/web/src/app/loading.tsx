import { Spinner } from '@stokk/ui';

export default function Loading(): React.JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner label="Yükleniyor" />
    </div>
  );
}
