import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AuthLayout, UserLayout } from './layouts';
import { PublicOnly, RequireAdmin, RequireUser } from './guards';
import { Spinner } from '../components/ui/Feedback';
import { NotFoundPage, RouteErrorPage } from '../pages/NotFoundPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { AuthConfirmPage, VerifyPage } from '../features/auth/VerifyPages';
import { AccountDisabledPage, ForgotPasswordPage, ResetPasswordPage } from '../features/auth/PasswordPages';
import { HomePage } from '../features/home/HomePage';
import { FacilitiesPage } from '../features/booking/FacilitiesPage';
import { FacilityBookingPage } from '../features/booking/FacilityBookingPage';
import { BookingConfirmedPage, BookingDetailPage, MyBookingsPage } from '../features/bookings/BookingsPages';
import { ChangePasswordPage, HelpPage, NotificationsPage, PrivacyPage, ProfilePage } from '../features/profile/ProfilePages';

type AdminModule = typeof import('../features/admin');
const admin = <K extends keyof AdminModule>(name: K) =>
  lazy(() => import('../features/admin').then((m) => ({ default: m[name] as ComponentType })));

const AdminLayout = admin('AdminLayout');
const AdminDashboardPage = admin('AdminDashboardPage');
const AdminBookingsPage = admin('AdminBookingsPage');
const AdminBlocksPage = admin('AdminBlocksPage');
const AdminUsersPage = admin('AdminUsersPage');
const AdminUserDetailPage = admin('AdminUserDetailPage');
const AdminSettingsPage = admin('AdminSettingsPage');
const AdminAuditPage = admin('AdminAuditPage');

const wait = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <PublicOnly><LoginPage /></PublicOnly> },
          { path: '/register', element: <PublicOnly><RegisterPage /></PublicOnly> },
          { path: '/forgot-password', element: <PublicOnly><ForgotPasswordPage /></PublicOnly> },
          { path: '/verify', element: <VerifyPage /> },
          { path: '/auth/confirm', element: <AuthConfirmPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          { path: '/account-disabled', element: <AccountDisabledPage /> },
          { path: '/privacy', element: <PrivacyPage /> },
        ],
      },
      {
        element: <RequireUser />,
        children: [
          {
            element: <UserLayout />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/facilities', element: <FacilitiesPage /> },
              { path: '/facilities/:code', element: <FacilityBookingPage /> },
              { path: '/bookings', element: <MyBookingsPage /> },
              { path: '/bookings/:id', element: <BookingDetailPage /> },
              { path: '/bookings/:id/confirmed', element: <BookingConfirmedPage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '/profile/notifications', element: <NotificationsPage /> },
              { path: '/profile/password', element: <ChangePasswordPage /> },
              { path: '/help', element: <HelpPage /> },
            ],
          },
          {
            element: <RequireAdmin />,
            children: [
              {
                element: wait(<AdminLayout />),
                children: [
                  { path: '/admin', element: wait(<AdminDashboardPage />) },
                  { path: '/admin/bookings', element: wait(<AdminBookingsPage />) },
                  { path: '/admin/blocks', element: wait(<AdminBlocksPage />) },
                  { path: '/admin/users', element: wait(<AdminUsersPage />) },
                  { path: '/admin/users/:id', element: wait(<AdminUserDetailPage />) },
                  { path: '/admin/settings', element: wait(<AdminSettingsPage />) },
                  { path: '/admin/audit', element: wait(<AdminAuditPage />) },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
