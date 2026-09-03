'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../components/common/page-fallback';
import { PermissionGate } from '../../../components/common/permission-gate';
import { ContactList } from '../../../components/contacts/contact-list';

export default function ContactsPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.CONTACT_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <ContactList />
      </Suspense>
    </PermissionGate>
  );
}
