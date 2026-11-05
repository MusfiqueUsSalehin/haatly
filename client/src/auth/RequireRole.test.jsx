// client/src/auth/RequireRole.test.jsx

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import RequireRole from './RequireRole.jsx';

let current = null;
vi.mock('./AuthContext.jsx', () => ({ useAuth: () => ({ user: current, loading: false }) }));

function visit(user, roles) {
  current = user;
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireRole roles={roles}>
              <p>secret</p>
            </RequireRole>
          }
        />
        <Route path="/hub" element={<p>hub home</p>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

it('sends a hub manager away from admin pages to their own screen', () => {
  visit({ role: 'hub_manager' }, ['admin']);
  expect(screen.getByText('hub home')).toBeInTheDocument();
});

it('sends signed-out visitors to login, and lets an admin in', () => {
  visit(null, ['admin']);
  expect(screen.getByText('login page')).toBeInTheDocument();
});

it('lets the right role through', () => {
  visit({ role: 'admin' }, ['admin']);
  expect(screen.getByText('secret')).toBeInTheDocument();
});
