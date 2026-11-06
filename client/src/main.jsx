// client/src/main.jsx  (replace)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { CartProvider } from './cart/CartContext.jsx';
import { CityProvider } from './city/CityContext.jsx';
import { I18nProvider } from './i18n/I18nContext.jsx';
import { ThemeProvider } from './theme/ThemeContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <CityProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </CityProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
