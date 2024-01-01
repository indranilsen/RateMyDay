import React from 'react';
import { AppBar, Tabs, Tab, Box, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import Menu from './Menu'; 

const NavigationTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Define tabs with corresponding routes
  const tabs = [
    { label: 'Date', route: '/day-rating' },
    { label: 'Month', route: '/month-view' },
    { label: 'Year', route: '/year-view' },
  ];

  // Find the current tab index
  const currentTab = tabs.findIndex(tab => location.pathname.startsWith(tab.route));

  const handleTabChange = (event, newValue) => {
    navigate(tabs[newValue].route);
  };

  return (
    <AppBar elevation={0} position="relative" color="default" sx={{ 
      backgroundColor: '#ffffff',
      display: 'flex',
      justifyContent: 'center',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: '1em',
      padding: theme.spacing(2, 0),
      '&.MuiTabs-indicator': {
        backgroundColor: '#ffffff',
        boxShadow: 'none'
      }
     }}>
      {/* Conditionally render the Menu based on the screen size */}
      {isMobile && <Menu isMobile={isMobile} />}
      <Box sx={{
        border: '1px solid grey', 
        backgroundColor: '#ffffff',
        display: 'flex',
        borderRadius: '4px',
        width: 'auto',
        justifyContent: 'center'
        }}>
        <Tabs
          value={currentTab !== -1 ? currentTab : false}
          onChange={handleTabChange}
          aria-label="navigation tabs"
          variant="scrollable"
          scrollButtons="auto"
          TabIndicatorProps={{ style: { display: 'none' } }}
          sx={{ 
            '.MuiTabs-flexContainer': {
              justifyContent: 'center' 
            }
          }}
        >
          {tabs.map((tab, index) => (
            <Tab 
              key={index} 
              label={tab.label}
              sx={{ 
                letterSpacing: '0.06em',
                backgroundColor: currentTab === index ? 'rgba(224, 224, 224, 0.4)' : 'inherit',
                borderRadius: '4px',
                '&.Mui-selected': {
                  backgroundColor: 'rgba(224, 224, 224, 0.4)',
                  color: 'grey',
                },
              }}
            />
          ))}
        </Tabs>
      </Box>
      {/* Render the Menu on non-mobile screens */}
      {!isMobile && <Menu isMobile={isMobile} />}
    </AppBar>
  );
};

export default NavigationTabs;
