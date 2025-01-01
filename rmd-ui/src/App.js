import React from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DayRating from './pages/DayRating';
import MonthView from './pages/MonthView';
import YearView from './pages/YearView';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import CssBaseline from '@mui/material/CssBaseline';

import Layout from './Layout';

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
    // basename should match the "homepage" field in package.json
    <Router basename="/rate-my-day"> 
      <CssBaseline />
      <Routes>
        {/* Wrap the shared layout around the routes where Menu should appear */}
        <Route path="/" element={<Layout />}> 
          <Route path="/day-rating/:year/:month/:day" element={<DayRating />} />
          <Route path="/day-rating" element={<DayRating />} />
          <Route path="/month-view/:year/:month" element={<MonthView />} />
          <Route path="/month-view" element={<MonthView />} />
          <Route path="/year-view/:year" element={<YearView />} />
          <Route path="/year-view" element={<YearView />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          {/* Redirect to /login as default */}
          <Route index element={<Navigate to="/login" />} />
        </Route>
        {/* Routes without the Menu */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    </Router>
  );
}

export default App;
