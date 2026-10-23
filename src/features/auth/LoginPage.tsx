import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import { authError, errorMessage, type ApiError } from '../../lib/errors';
import { safeNext } from '../../lib/safe-redirect';
import { AuthCard } from '../../app/layouts';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { isEmail, loginAddress } from './password';

// Staging/UAT only: short test usernames ("Admin1") sign in to this domain. Never set for production builds.
const TEST_DOMAIN = (import.meta.env.VITE_TEST_LOGIN_DOMAIN as string | undefined)?.trim() || null;

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const addr = loginAddress(email, TEST_DOMAIN);
  const emailError = touched && !isEmail(addr) ? (TEST_DOMAIN ? 'Enter your email or test username.' : 'Enter a valid email address.') : undefined;
  const passwordError = touched && !password ? 'Enter your password.' : undefined;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isEmail(addr) || !password) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password });
    setBusy(false);
    if (err) {
      const mapped = authError(err);
      if (mapped.code === 'EMAIL_NOT_VERIFIED') {
        navigate(`/verify?email=${encodeURIComponent(addr)}`);
        return;
      }
      setError(mapped);
      return;
    }
    navigate(safeNext(params.get('next')), { replace: true });
  };

  return (
    <AuthCard title="Sign in" subtitle="Book DCU sports facilities in under a minute.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {TEST_DOMAIN ? (
          <TextField label="Email or test username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="e.g. Admin1 or name@danamon.co.id" hint="Test environment: Admin1, Admin2, User1 or User2."
            value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
        ) : (
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" placeholder="name@danamon.co.id"
            value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
        )}
        <TextField label="Password" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} error={passwordError} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">Forgot password?</Link>
        </div>
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p>}
        <Button type="submit" block loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-muted">
        New here? <Link to="/register" className="font-semibold text-primary underline-offset-2 hover:underline">Create an account</Link>
      </p>
    </AuthCard>
  );
}
