import { useState, type ReactNode } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from './Button';
import { TextAreaField } from './Field';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** "sheet": bottom sheet on mobile, centered modal from 768px (UX spec §4 ReviewSheet). */
  variant?: 'modal' | 'sheet';
  wide?: boolean;
}

export function Modal({ open, onOpenChange, title, description, children, footer, variant = 'modal', wide = false }: ModalProps) {
  const position =
    variant === 'sheet'
      ? 'inset-x-0 bottom-0 rounded-t-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl'
      : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl w-[calc(100%-2rem)]';
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RDialog.Content
          className={`fixed z-50 max-h-[90dvh] overflow-y-auto bg-white p-5 shadow-xl md:w-full ${wide ? 'md:max-w-2xl' : 'md:max-w-md'} ${position}`}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <RDialog.Title className="text-lg font-bold text-ink">{title}</RDialog.Title>
            <RDialog.Close className="-m-2 rounded-lg p-2 text-muted hover:bg-surface" aria-label="Close">
              <X className="size-5" aria-hidden="true" />
            </RDialog.Close>
          </div>
          {description ? (
            <RDialog.Description className="mb-3 text-muted">{description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{title}</RDialog.Description>
          )}
          {children}
          {footer && <div className="pb-safe mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When true, a reason (5–500 chars) is required and passed to onConfirm (admin actions). */
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  error?: string;
  children?: ReactNode;
  onConfirm: (reason: string) => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, title, description } = props;
  // The body is unmounted by Radix when the dialog closes, so the reason field always starts empty.
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <ConfirmBody {...props} />
    </Modal>
  );
}

function ConfirmBody({
  onOpenChange, confirmLabel, cancelLabel = 'Keep', destructive = false, requireReason = false,
  reasonLabel = 'Reason', loading = false, error, children, onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const reasonOk = !requireReason || reason.trim().length >= 5;

  return (
    <>
      {children}
      {requireReason && (
        <div className="mt-3">
          <TextAreaField
            label={reasonLabel}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            error={touched && !reasonOk ? 'Please enter a reason (at least 5 characters).' : undefined}
            hint={`${reason.trim().length}/500 characters. Recorded in the audit log.`}
          />
        </div>
      )}
      {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
      <div className="pb-safe mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          loading={loading}
          onClick={() => {
            setTouched(true);
            if (reasonOk) onConfirm(reason.trim());
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </>
  );
}
