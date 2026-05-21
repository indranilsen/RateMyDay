import React from 'react';
import { Outlet } from 'react-router-dom';
import { Box } from '@mui/material';
import NavigationTabs from './components/NavigationTabs';

const Layout = () => {
  return (
    <>
      <NavigationTabs />
      {/* `component="main"` adds the missing landmark element so screen
          readers (and Lighthouse's landmark-one-main audit) have a "main
          content" target — the nav lives outside this Box on purpose. */}
      <Box component="main">
        <Outlet />
      </Box>
    </>
  );
};

export default Layout;
