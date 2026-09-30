/**
 * Router — defines all URL routes and who can access them.
 *
 * Beginner note:
 * React Router maps URLs to React components (pages).
 * For example, "/command" loads CommandCenterPage.
 *
 * Routes are protected by RoleGuard — if you're not logged in
 * or don't have the right role, you get redirected to login.
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RoleGuard } from './RoleGuard';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { CommandCenterPage } from '@/pages/CommandCenterPage';
import { PlanDiffPage } from '@/pages/PlanDiffPage';
import { ApprovalInboxPage } from '@/pages/ApprovalInboxPage';
import { CrewPage } from '@/pages/CrewPage';
import { AfterActionPage } from '@/pages/AfterActionPage';
import { SOSHelpPage } from '@/pages/SOSHelpPage';

export const router = createBrowserRouter([
  {
    path: '/sos',
    element: <SOSHelpPage />,
  },
  {
    path: '/help',
    element: <Navigate to="/sos" replace />,
  },
  {
    path: '/report',
    element: <Navigate to="/sos" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    // Operator and Reviewer routes — wrapped in AppShell (top bar + layout)
    element: (
      <RoleGuard allowedRoles={['operator', 'reviewer']}>
        <AppShell />
      </RoleGuard>
    ),
    children: [
      { path: '/', element: <Navigate to="/command" replace /> },
      { path: '/command', element: <CommandCenterPage /> },
      { path: '/command/plan', element: <PlanDiffPage /> },
      { path: '/command/approvals', element: <ApprovalInboxPage /> },
      { path: '/after-action', element: <AfterActionPage /> },
    ],
  },
  {
    // Crew route — mobile-first, no operator shell
    path: '/crew',
    element: (
      <RoleGuard allowedRoles={['crew']}>
        <CrewPage />
      </RoleGuard>
    ),
  },
  // Catch-all → login
  { path: '*', element: <Navigate to="/login" replace /> },
]);
