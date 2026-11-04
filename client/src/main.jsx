// client/src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { CityProvider } from './city/CityContext.jsx';
import { CartProvider } from './cart/CartContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <AuthProvider>
            <CityProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </CityProvider>
          </AuthProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
