import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { authError, errorMessage, type ApiError } from '../../lib/errors';
import { AuthCard } from '../../app/layouts';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { PasswordRules } from './PasswordRules';
import { emailDomain, isEmail, passwordMeetsPolicy } from './password';

export function RegisterPage() {
  const navigate = useNavigate();
  const domains = useQuery({ queryKey: ['registration-domains'], queryFn: api.registrationDomains, staleTime: 300_000 });
  const allowed = domains.data?.domains ?? [];
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const name = form.fullName.trim();
  const domain = emailDomain(form.email);
  const domainBlocked = Boolean(domain && domain.includes('.') && allowed.length > 0 && !allowed.includes(domain));
  const errors = {
    fullName: name.length < 2 || name.length > 100 ? 'Enter your full name (2–100 characters).' : undefined,
    email: !isEmail(form.email) ? 'Enter a valid email address.' : undefined,
    password: !passwordMeetsPolicy(form.password) ? 'The password does not meet all requirements.' : undefined,
    confirm: form.password !== form.confirm ? 'Passwords do not match.' : undefined,
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean) || domainBlocked) return;
    setBusy(true);
    setError(null);
    const addr = form.email.trim().toLowerCase();
    const { error: err } = await supabase.auth.signUp({
      email: addr,
      password: form.password,
      options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (err) { setError(authError(err)); return; }
    // Same next step whether or not the address already had an account (no account enumeration).
    navigate(`/verify?email=${encodeURIComponent(addr)}`);
  };

  const domainList = allowed.map((d) => `@${d}`).join(', ');
  return (
    <AuthCard title="Create your account" subtitle={<>Use your company email{allowed.length > 0 && <>: {allowed.map((d) => `@${d}`).join(' · ')}</>}</>}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={show('fullName')} />
        <TextField label="Company email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')}
          error={show('email') ?? (domainBlocked ? `@${domain} can't register. Use your company email.` : undefined)} />
        <div>
          <TextField label="Password" type="password" autoComplete="new-password" aria-describedby="pw-rules"
            value={form.password} onChange={set('password')} error={show('password')} />
          <PasswordRules id="pw-rules" password={form.password} />
        </div>
        <TextField label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={show('confirm')} />
        <p className="text-sm text-muted">
          By creating an account you agree to the <Link to="/privacy" className="font-semibold text-primary underline">Privacy notice</Link>.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            {error.code === 'EMAIL_DOMAIN_NOT_ALLOWED' && allowed.length > 0
              ? `Please register with your company email (${domainList}).`
              : errorMessage(error)}
          </p>
        )}
        <Button type="submit" block loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-muted">
        Already registered? <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">Sign in</Link>
      </p>
    </AuthCard>
  );
}
