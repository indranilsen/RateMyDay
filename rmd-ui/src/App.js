import React, { Suspense, lazy } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

// Eager imports — the entry points users hit most often. Keeping them in the
// main bundle avoids a Suspense flash on the highest-traffic routes.
import LoginPage from './pages/LoginPage';
import DayRating from './pages/DayRating';
import Layout from './Layout';
import { ThemeProvider } from './ThemeContext';

// Lazy imports — each becomes its own webpack chunk and only loads when
// the user navigates to that route. Biggest wins:
//   - Admin pages (react-quill + marked, ~80 KiB) — most users never visit
//   - SettingsPage — was pulling in moment-timezone (since removed)
//   - InsightsPage — chart helpers
// Lighthouse `unused-javascript` flagged all of these as wasted bytes on
// non-admin routes; route-level splitting is the canonical fix.
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const MonthView = lazy(() => import('./pages/MonthView'));
const YearView = lazy(() => import('./pages/YearView'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const RateRedirect = lazy(() => import('./pages/RateRedirect'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const SystemStatsPage = lazy(() => import('./pages/admin/SystemStatsPage'));
const AdHocEmailsPage = lazy(() => import('./pages/admin/AdHocEmailsPage'));
const ManageUsersPage = lazy(() => import('./pages/admin/ManageUsersPage'));
const UserDetailPage = lazy(() => import('./pages/admin/UserDetailPage'));
const OperationsPage = lazy(() => import('./pages/admin/OperationsPage'));

// Centered spinner shown while a lazy route chunk is downloading. Sized
// to take ~one screen so the page doesn't jump when the chunk resolves.
const RouteFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <CircularProgress />
  </Box>
);

// Axios interceptor setup
axios.interceptors.response.use(response => {
  return response;
}, error => {
  if (error.response && (error.response.status === 401 || error.response.status === 403)) {
    // Redirect to login on session expiry or unauthorized access
    const event = new CustomEvent('unauthorized');
    window.dispatchEvent(event);
  }
  return Promise.reject(error);
});

const App = () => {
  return (
    <ThemeProvider>
      {/* basename should match the "homepage" field in package.json */}
      <Router basename="/rate-my-day">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Wrap the shared layout around the routes where Menu should appear */}
            <Route path="/" element={<Layout />}>
              <Route path="/day-rating/:year/:month/:day" element={<DayRating />} />
              <Route path="/day-rating" element={<DayRating />} />
              <Route path="/month-view/:year/:month" element={<MonthView />} />
              <Route path="/month-view" element={<MonthView />} />
              <Route path="/year-view/:year" element={<YearView />} />
              <Route path="/year-view" element={<YearView />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/rate" element={<RateRedirect />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="stats" replace />} />
                <Route path="stats" element={<SystemStatsPage />} />
                <Route path="emails" element={<AdHocEmailsPage />} />
                <Route path="users" element={<ManageUsersPage />} />
                <Route path="users/:userId" element={<UserDetailPage />} />
                <Route path="operations" element={<OperationsPage />} />
              </Route>
              {/* Redirect to /login as default */}
              <Route index element={<Navigate to="/login" />} />
            </Route>
            {/* Routes without the Menu */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Routes>
        </Suspense>
      </Router>
    </ThemeProvider>
  );
}

export default App;
