import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import type { BookingView } from '../../lib/types';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { formatDate } from '../../lib/time';

/** Cancel (with confirmation) and check-in actions shared by Home, My bookings and Booking detail. */
export function useBookingActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [toCancel, setToCancel] = useState<BookingView | null>(null);

  const refresh = (b: BookingView) => {
    void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['booking', b.id] });
    void queryClient.invalidateQueries({ queryKey: ['availability', b.facility.code] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const cancel = useMutation({
    mutationFn: (b: BookingView) => api.cancelMyBooking(b.id),
    onSuccess: (b) => {
      setToCancel(null);
      refresh(b);
      toast({ tone: 'success', title: 'Booking cancelled', description: 'The time is now free for others.' });
    },
  });

  const checkIn = useMutation({
    mutationFn: (b: BookingView) => api.checkIn(b.id),
    onSuccess: (b) => {
      refresh(b);
      toast({ tone: 'success', title: "You're checked in", description: 'Enjoy your game!' });
    },
    onError: (e) => toast({ tone: 'error', title: 'Check-in failed', description: errorMessage(e) }),
  });

  const dialog = (
    <ConfirmDialog
      open={toCancel !== null}
      onOpenChange={(o) => { if (!o) { setToCancel(null); cancel.reset(); } }}
      title="Cancel this booking?"
      description={toCancel ? `${toCancel.facility.name} · ${formatDate(toCancel.date_wib)}, ${toCancel.start_wib}–${toCancel.end_wib} WIB. The time will be released for others.` : undefined}
      confirmLabel="Cancel booking"
      cancelLabel="Keep booking"
      destructive
      loading={cancel.isPending}
      error={cancel.isError ? errorMessage(cancel.error) : undefined}
      onConfirm={() => toCancel && cancel.mutate(toCancel)}
    />
  );

  return {
    requestCancel: (b: BookingView) => { cancel.reset(); setToCancel(b); },
    checkIn: (b: BookingView) => checkIn.mutate(b),
    checkingIn: checkIn.isPending ? checkIn.variables?.id : undefined,
    dialog,
  };
}
