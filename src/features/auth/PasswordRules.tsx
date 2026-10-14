import { Check, X } from 'lucide-react';
import { PASSWORD_RULES } from './password';

export function PasswordRules({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} className="mt-2 grid gap-1 text-sm sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? 'text-available' : 'text-muted'}`}>
            {ok ? <Check className="size-4" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
            <span>{rule.label}</span>
            <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
