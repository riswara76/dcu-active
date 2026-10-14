import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.appConfig, staleTime: 5 * 60_000 });
}

export function useFacilities() {
  return useQuery({ queryKey: ['facilities'], queryFn: api.facilities, staleTime: 60 * 60_000 });
}

export function useUpcomingBookings() {
  return useQuery({
    queryKey: ['my-bookings', 'UPCOMING', 'first'],
    queryFn: () => api.myBookings('UPCOMING', null, 20),
    refetchInterval: 60_000, // statuses move with time (check-in window, cancel cutoff)
  });
}
