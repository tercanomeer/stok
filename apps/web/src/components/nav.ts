import {
  Boxes,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

import { PERMISSIONS, type Permission } from '@stokk/types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Görünürlük izni; yoksa herkese açık. */
  permission?: Permission;
  /** Ekranı henüz gelmedi (Faz 9–11) — menüde görünür, pasif. */
  soon?: boolean;
}

/**
 * Sidebar menüsü — izne göre filtrelenir (izni olmayan öğe hiç render edilmez).
 * Panel herkese açıktır; içeriği yetkiye göre uyarlanır. Diğer ekranlar sonraki
 * fazlarda gelir, o zamana kadar `soon` ile pasif gösterilir.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Panel', href: '/', icon: LayoutDashboard },
  {
    label: 'Ürünler',
    href: '/products',
    icon: Package,
    permission: PERMISSIONS.PRODUCT_VIEW,
    soon: true,
  },
  {
    label: 'Stok',
    href: '/stock',
    icon: Warehouse,
    permission: PERMISSIONS.STOCK_VIEW,
    soon: true,
  },
  {
    label: 'Satışlar',
    href: '/sales',
    icon: ShoppingCart,
    permission: PERMISSIONS.SALE_VIEW,
    soon: true,
  },
  {
    label: 'Cariler',
    href: '/contacts',
    icon: Users,
    permission: PERMISSIONS.CONTACT_VIEW,
    soon: true,
  },
  {
    label: 'Alışlar',
    href: '/purchases',
    icon: Boxes,
    permission: PERMISSIONS.PURCHASE_VIEW,
    soon: true,
  },
  {
    label: 'Finans',
    href: '/finance',
    icon: Wallet,
    permission: PERMISSIONS.EXPENSE_VIEW,
    soon: true,
  },
  {
    label: 'Raporlar',
    href: '/reports',
    icon: FileText,
    permission: PERMISSIONS.REPORT_SALES_VIEW,
    soon: true,
  },
  {
    label: 'Kullanıcılar',
    href: '/users',
    icon: UserCog,
    permission: PERMISSIONS.USER_VIEW,
    soon: true,
  },
  {
    label: 'Ayarlar',
    href: '/settings',
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_MANAGE,
    soon: true,
  },
];
