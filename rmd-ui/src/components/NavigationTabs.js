import React from 'react';
import { AppBar, Tabs, Tab, Box, useMediaQuery, useTheme } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import Menu from './Menu';
import ThemeToggle from './ThemeToggle';

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
      backgroundColor: 'background.default',
      display: 'flex',
      justifyContent: 'center',
      flexDirection: 'column',
      alignItems: 'center',
      marginBottom: '1em',
      padding: theme.spacing(2, 0),
      '&.MuiTabs-indicator': {
        boxShadow: 'none'
      }
     }}>
      {/* Mobile: top row with the theme toggle on the left and the icon
          menu on the right, mirroring the desktop's absolute-positioned
          left/right layout. */}
      {isMobile && (
        <Box sx={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: '10px',
          paddingRight: '10px',
          mb: 1
        }}>
          <ThemeToggle />
          <Menu isMobile={isMobile} />
        </Box>
      )}

      {/* Desktop: theme toggle floats absolute top-left, mirroring the
          icon menu on the top-right. The 18px left padding lines the pill's
          edge up with the icon glyphs on the right (which are visually
          inset by ~18px because of the IconButton's intrinsic padding). */}
      {!isMobile && (
        <Box sx={{
          position: 'absolute',
          left: 0,
          top: 'auto',
          padding: '10px 10px 10px 18px',
          height: '64px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <ThemeToggle />
        </Box>
      )}
      <Box sx={{
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
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
                // `action.selected` and `text.primary` are theme-aware so the
                // selected pill has enough contrast in both light and dark
                backgroundColor: currentTab === index ? 'action.selected' : 'inherit',
                borderRadius: '4px',
                '&.Mui-selected': {
                  backgroundColor: 'action.selected',
                  color: 'text.primary',
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
