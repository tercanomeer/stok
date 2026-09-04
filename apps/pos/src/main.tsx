import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import { CustomerDisplayScreen } from './screens/customer-display-screen';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

/**
 * Aynı paket iki pencereye hizmet eder: kasa ekranı ve müşteri ekranı.
 *
 * Ayrı bir Vite girişi açmak, aynı bileşenlerin ve stillerin iki kopyasını
 * paketlemek demekti; ayrım adres parçasıyla (`#customer`) yapılıyor.
 */
const isCustomerDisplay = window.location.hash === '#customer';

createRoot(container).render(
  <StrictMode>{isCustomerDisplay ? <CustomerDisplayScreen /> : <App />}</StrictMode>,
);
