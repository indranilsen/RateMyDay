import React from 'react';
import { Outlet } from 'react-router-dom';
import NavigationTabs from './components/NavigationTabs'; 

const Layout = () => {
  return (
    <>
      <NavigationTabs />
      <Outlet /> {/* This will render the current route's component */}
    </>
  );
};

export default Layout;
