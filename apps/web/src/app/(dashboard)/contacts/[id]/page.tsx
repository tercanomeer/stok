'use client';

import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { ContactDetail } from '../../../../components/contacts/contact-detail';

export default function ContactDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSIONS.CONTACT_VIEW}>
      <ContactDetail contactId={params.id} />
    </PermissionGate>
  );
}
