import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authError, errorMessage, type ApiError } from '../../lib/errors';
import { useAuth } from '../../auth/AuthProvider';
import { AuthCard } from '../../app/layouts';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
}

function useCooldown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(seconds)] as const;
}

/** S3 — enter the 6-digit code from the email. */
export function VerifyPage() {
  const [params] = useSearchParams();
  const email = (params.get('email') ?? '').toLowerCase();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, restartCooldown] = useCooldown(60);

  const verify = async (token: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (err) { setError(authError(err)); return; }
    await refreshProfile();
    navigate('/', { replace: true });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{6}$/.test(code)) void verify(code);
    else setError(null);
  };

  const resend = async () => {
    setError(null);
    const { error: err } = await supabase.auth.resend({ type: 'signup', email });
    if (err) { setError(authError(err)); return; }
    setResent(true);
    restartCooldown();
  };

  if (!email) {
    return (
      <AuthCard title="Check your email">
        <p className="text-muted">Open the email from <strong>DCU@danamon.co.id</strong> and follow the link, or <Link to="/login" className="font-semibold text-primary underline">sign in</Link> to continue.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Check your email" subtitle={<>We sent a 6-digit code to <strong>{maskEmail(email)}</strong>.</>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="text-center text-2xl tracking-[0.5em] tabular"
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) void verify(v); // pasted or completed code submits automatically
          }}
        />
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p>}
        {resent && !error && <p role="status" className="text-sm text-available">A new code has been sent.</p>}
        <Button type="submit" block loading={busy} disabled={code.length !== 6}>Verify</Button>
      </form>
      <div className="mt-5 space-y-2 text-sm text-muted">
        <p>
          Didn&apos;t get it?{' '}
          <button type="button" onClick={() => void resend()} disabled={cooldown > 0}
            className="font-semibold text-primary underline disabled:text-subtle disabled:no-underline">
            {cooldown > 0 ? `Resend in 0:${String(cooldown).padStart(2, '0')}` : 'Resend code'}
          </button>
        </p>
        <p>Tip: check your Junk or Quarantine folder. The sender is <strong>DCU@danamon.co.id</strong>.</p>
      </div>
    </AuthCard>
  );
}

/** S3b — scanner-safe email link: nothing is verified until the person clicks (TR-AUTH-03). */
export function AuthConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const tokenHash = params.get('token_hash');
  const type = params.get('type') === 'signup' ? 'signup' : 'email';
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!tokenHash) return;
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    setBusy(false);
    if (err) { setError(authError(err)); return; }
    await refreshProfile();
    navigate('/', { replace: true });
  };

  return (
    <AuthCard title="Confirm your email" subtitle="Confirm your email address for DCU Active.">
      <MailCheck className="mb-4 size-10 text-primary" aria-hidden="true" />
      {!tokenHash ? (
        <p className="text-muted">This link is incomplete. Please use the 6-digit code from the email instead.</p>
      ) : (
        <>
          {error && <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(error)}</p>}
          <Button block loading={busy} onClick={() => void confirm()}>Confirm my email</Button>
        </>
      )}
      <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold text-primary underline">Back to sign in</Link></p>
    </AuthCard>
  );
}
