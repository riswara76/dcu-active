import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import { authError, errorMessage, type ApiError } from '../../lib/errors';
import { useAuth } from '../../auth/AuthProvider';
import { AuthCard } from '../../app/layouts';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { PasswordRules } from './PasswordRules';
import { passwordMeetsPolicy } from './password';

/** S4 — request a reset code. The response never reveals whether an account exists. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    const mapped = err ? authError(err) : null;
    if (mapped && mapped.code === 'RATE_LIMITED') { setError(mapped); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <p className="text-muted">If an account exists for <strong>{email.trim().toLowerCase()}</strong>, we&apos;ve sent a 6-digit reset code.</p>
        <Link to={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}
          className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
          Enter the code
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a code to set a new password.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p>}
        <Button type="submit" block loading={busy}>Send reset code</Button>
      </form>
      <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-primary underline">Back to sign in</Link></p>
    </AuthCard>
  );
}

/** S5 — verify the reset code (or scanner-safe link), then set a new password. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshProfile } = useAuth();
  const tokenHash = params.get('token_hash');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [touched, setTouched] = useState(false);

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      : await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'recovery' });
    setBusy(false);
    if (err) { setError(authError(err)); return; }
    setVerified(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!passwordMeetsPolicy(password) || password !== confirm) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setBusy(false); setError(authError(err)); return; }
    await supabase.auth.signOut({ scope: 'others' });
    setBusy(false);
    await refreshProfile();
    toast({ tone: 'success', title: 'Password updated', description: 'Other devices were signed out.' });
    navigate('/', { replace: true });
  };

  if (!verified) {
    return (
      <AuthCard title="Reset password" subtitle={tokenHash ? 'Continue to set a new password.' : 'Enter the 6-digit code from the email.'}>
        <form onSubmit={verify} className="space-y-4" noValidate>
          {!tokenHash && (
            <>
              <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextField label="Reset code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                className="text-center text-2xl tracking-[0.5em] tabular"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p>}
          <Button type="submit" block loading={busy} disabled={!tokenHash && code.length !== 6}>Continue</Button>
        </form>
        <p className="mt-6 text-center text-sm"><Link to="/forgot-password" className="font-semibold text-primary underline">Request a new code</Link></p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <PasswordForm password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm}
        touched={touched} busy={busy} error={error} onSubmit={save} submitLabel="Update password" />
    </AuthCard>
  );
}

export function PasswordForm(props: {
  password: string; confirm: string; setPassword: (v: string) => void; setConfirm: (v: string) => void;
  touched: boolean; busy: boolean; error: ApiError | null; onSubmit: (e: FormEvent) => void; submitLabel: string;
}) {
  const { password, confirm, setPassword, setConfirm, touched, busy, error, onSubmit, submitLabel } = props;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <TextField label="New password" type="password" autoComplete="new-password" aria-describedby="pw-rules-reset"
          value={password} onChange={(e) => setPassword(e.target.value)}
          error={touched && !passwordMeetsPolicy(password) ? 'The password does not meet all requirements.' : undefined} />
        <PasswordRules id="pw-rules-reset" password={password} />
      </div>
      <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm}
        onChange={(e) => setConfirm(e.target.value)} error={touched && password !== confirm ? 'Passwords do not match.' : undefined} />
      {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p>}
      <Button type="submit" block loading={busy}>{submitLabel}</Button>
    </form>
  );
}

/** S6 — account disabled. */
export function AccountDisabledPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const support = (import.meta.env.VITE_SUPPORT_CONTACT as string | undefined) ?? 'DCU';
  return (
    <AuthCard title="Your account has been disabled">
      <p className="text-muted">If you think this is a mistake, contact DCU at <strong>{support}</strong>.</p>
      <Button className="mt-6" block variant="secondary" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
        Sign out
      </Button>
    </AuthCard>
  );
}
