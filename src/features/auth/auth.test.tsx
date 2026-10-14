import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { axeViolations } from '../../test/setup';

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a), signUp: (...a: unknown[]) => signUp(...a) }, rpc: (...a: unknown[]) => rpc(...a) },
}));
const navigate = vi.fn();
vi.mock('react-router', async (orig) => ({ ...(await orig<typeof import('react-router')>()), useNavigate: () => navigate }));

import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

function renderWithProviders(ui: ReactElement, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { domains: ['adira.co.id', 'danamon.co.id', 'homecredit.co.id'] }, error: null });
});

describe('LoginPage', () => {
  it('validates fields before calling Auth', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows a generic message on wrong credentials (no account enumeration)', async () => {
    signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'Rina@Danamon.co.id');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'rina@danamon.co.id', password: 'wrong' });
  });

  it('follows only safe "next" targets after sign-in (TEST-50)', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderWithProviders(<LoginPage />, '/login?next=https%3A%2F%2Fevil.example');
    await userEvent.type(screen.getByLabelText('Email'), 'rina@danamon.co.id');
    await userEvent.type(screen.getByLabelText('Password'), 'Strong#Pass2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<LoginPage />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('RegisterPage', () => {
  it('lists allowed domains and warns about other domains before submitting', async () => {
    renderWithProviders(<RegisterPage />);
    expect(await screen.findByText(/@adira\.co\.id · @danamon\.co\.id · @homecredit\.co\.id/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Company email'), 'rina@gmail.com');
    expect(screen.getByText("@gmail.com can't register. Use your company email.")).toBeInTheDocument();
  });

  it('enforces the password policy in the form and sends the trimmed name', async () => {
    signUp.mockResolvedValue({ error: null });
    renderWithProviders(<RegisterPage />);
    await screen.findByText(/@adira\.co\.id/);
    await userEvent.type(screen.getByLabelText('Full name'), '  Rina Lestari ');
    await userEvent.type(screen.getByLabelText('Company email'), 'rina@danamon.co.id');
    await userEvent.type(screen.getByLabelText('Password'), 'weakpass');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'weakpass');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByText('The password does not meet all requirements.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'Strong#Pass2026');
    await userEvent.clear(screen.getByLabelText('Confirm password'));
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Strong#Pass2026');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'rina@danamon.co.id', password: 'Strong#Pass2026',
      options: expect.objectContaining({ data: { full_name: 'Rina Lestari' } }),
    }));
    expect(navigate).toHaveBeenCalledWith('/verify?email=rina%40danamon.co.id');
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<RegisterPage />);
    await screen.findByText(/@adira\.co\.id/);
    expect(await axeViolations(container)).toEqual([]);
  });
});
