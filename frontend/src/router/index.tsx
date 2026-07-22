import { AppLayout } from '@/components/layout/AppLayout'
import { PageLoader } from '@/components/shared/PageLoader'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'

// Auth
const LoginPage = lazy(() => import('@/pages/LoginPage'))

// Feature pages
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const IncidentListPage = lazy(() => import('@/pages/IncidentListPage'))
const IncidentDetailPage = lazy(() => import('@/pages/IncidentDetailPage'))
const RecoveryTimelinePage = lazy(() => import('@/pages/RecoveryTimelinePage'))
const RecoveryExecutionPage = lazy(() => import('@/pages/RecoveryExecutionPage'))
const PoliciesPage = lazy(() => import('@/pages/PoliciesPage'))
const ApprovalsPage = lazy(() => import('@/pages/ApprovalsPage'))
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const IntegrationsPage = lazy(() => import('@/pages/IntegrationsPage'))
const ClusterPage = lazy(() => import('@/pages/ClusterPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))

function suspend(component: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{component}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: suspend(<DashboardPage />),
      },
      {
        path: 'incidents',
        element: suspend(<IncidentListPage />),
      },
      {
        path: 'incidents/:decisionId',
        element: suspend(<IncidentDetailPage />),
      },
      {
        path: 'incidents/:decisionId/timeline',
        element: suspend(<RecoveryTimelinePage />),
      },
      {
        path: 'incidents/:decisionId/recovery',
        element: suspend(<RecoveryExecutionPage />),
      },
      {
        path: 'policies',
        element: suspend(<PoliciesPage />),
      },
      {
        path: 'approvals',
        element: suspend(<ApprovalsPage />),
      },
      {
        path: 'audit',
        element: suspend(<AuditLogsPage />),
      },
      {
        path: 'analytics',
        element: suspend(<AnalyticsPage />),
      },
      {
        path: 'reports',
        element: suspend(<ReportsPage />),
      },
      {
        path: 'integrations',
        element: suspend(<IntegrationsPage />),
      },
      {
        path: 'cluster',
        element: suspend(<ClusterPage />),
      },
      {
        path: 'settings',
        element: suspend(<SettingsPage />),
      },
      {
        path: 'profile',
        element: suspend(<ProfilePage />),
      },
      {
        path: 'notifications',
        element: suspend(<NotificationsPage />),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
