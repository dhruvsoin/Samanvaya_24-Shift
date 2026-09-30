/**
 * RoleGuard — protects routes based on the logged-in user's role.
 *
 * Beginner note:
 * If you try to go to /command without being logged in as an operator,
 * this component automatically redirects you to /login.
 */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import type { Role } from '@contracts/types';

interface Props {
  allowedRoles: Role[];
  children: ReactNode;
}

export function RoleGuard({ allowedRoles, children }: Props) {
  const { isLoggedIn, role } = useAuthStore();

  if (!isLoggedIn || !role) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role)) {
    // Logged in but wrong role — send crew to /crew, others to /login
    if (role === 'crew') return <Navigate to="/crew" replace />;
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
