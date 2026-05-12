import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, Paper, Tabs, Tab, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import DayRatingColors from '../../RatingColor';

// Maps the active route segment to a tab index so the highlight follows
// the URL even on direct navigation (e.g. typing /admin/users in the bar).
const TABS = [
  { value: 'stats',      label: 'System Stats' },
  { value: 'emails',     label: 'Ad-hoc Emails' },
  { value: 'users',      label: 'Manage Users' },
  { value: 'operations', label: 'Operations' }
];

// Local theme override so the admin pages render in monotone grey instead of
// the default MUI blue. Scoped to the admin subtree via ThemeProvider — the
// rest of the app keeps its existing palette. `error` is pinned to the
// rating-1 red so destructive buttons match the day-rating palette.
//
// Built as a function so MUI passes us the outer theme — we MERGE on top of
// it (preserving mode, background, text, and the global MuiPaper overrides
// from ThemeContext) and only swap the brand colors. Building a fresh
// createTheme() here would silently reset dark mode back to light.
const makeAdminTheme = (outer) => createTheme({
  ...outer,
  palette: {
    ...outer.palette,
    primary: {
      main: '#787878',
      light: '#a0a0a0',
      dark: '#505050',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#909090'
    },
    error: {
      main: DayRatingColors[1],
      light: DayRatingColors[2],
      dark: DayRatingColors[1],
      contrastText: '#ffffff'
    }
  }
});

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // location.pathname looks like '/admin/users/3' or '/admin/stats' — first
  // segment after /admin is the active tab
  const segments = location.pathname.split('/').filter(Boolean);
  const activeIdx = segments[0] === 'admin' && segments[1]
    ? TABS.findIndex(t => t.value === segments[1])
    : 0;
  const tabIndex = activeIdx === -1 ? 0 : activeIdx;

  const handleTabChange = (event, idx) => {
    navigate(`/admin/${TABS[idx].value}`);
  };

  return (
    <ThemeProvider theme={makeAdminTheme}>
      <Box sx={{ p: 2 }}>
        <Paper elevation={0} sx={{ p: 2, maxWidth: '900px', margin: 'auto' }}>
          <Typography
            variant="h4"
            align="center"
            sx={{
              mb: 4,
              fontWeight: '100',
              color: 'grey',
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}
          >
            Admin Panel
          </Typography>

          <Tabs
            value={tabIndex}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              mb: 3,
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}
          >
            {TABS.map((t) => (
              <Tab
                key={t.value}
                label={t.label}
                sx={{
                  padding: '6px 12px',
                  fontSize: '0.9rem',
                  letterSpacing: '0.06em'
                }}
              />
            ))}
          </Tabs>

          <Outlet />
        </Paper>
      </Box>
    </ThemeProvider>
  );
};

export default AdminLayout;
