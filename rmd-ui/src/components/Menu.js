import React, { useState, useEffect } from 'react';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import SettingsIcon from '@mui/icons-material/Settings';
import BarChartIcon from '@mui/icons-material/BarChart';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { IconButton, Box, Badge, Tooltip } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import config from '../Config';
import DayRatingColors from '../RatingColor';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

const Menu = ({ isMobile }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Current streak — overlays as a small badge on the Insights icon so the
  // user has a live "you're on a roll" indicator without cluttering the nav.
  // Refetches whenever the route changes so it stays current after a rating
  // submission (which always navigates).
  const [streak, setStreak] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const fetchStreak = async () => {
      try {
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/streak`, { withCredentials: true });
        if (!cancelled) setStreak(response.data.current);
      } catch (err) {
        // Non-essential — silently leave the badge off
        if (!cancelled) setStreak(null);
      }
    };
    fetchStreak();
    return () => { cancelled = true; };
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await axios.post(`${ENDPOINT_PREFIX}/api/users/logout`, {}, {
        withCredentials: true
      });
      navigate('/login');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  const handleInsights = () => {
    navigate('/insights');
  };

  // Check if user is admin
  const userRole = localStorage.getItem('userRole');
  const isAdmin = (userRole === 'admin');

  // Common style for IconButton
  const iconButtonStyle = {
    color: 'grey',
    height: '100%',
    '&:hover': { 
      backgroundColor: 'transparent',
      '& svg': { 
        color: '#a3a3a3', // Change icon color on hover
      },
    },
    '&:hover .MuiIconButton-focusVisible': {
      backgroundColor: 'transparent',
    }
  };

  return (
    <Box sx={{
      ddisplay: 'flex',
      alignItems: 'center',
      position: isMobile ? 'relative' : 'absolute', // Only position absolutely on non-mobile
      right: 0,
      top: isMobile ? 0 : 'auto', // Adjust top only for mobile
      padding: '10px',
      height: '64px'
    }}>
      {isAdmin &&
        (
          <IconButton onClick={() => navigate('/admin')} sx={{ ...iconButtonStyle }}>
            <AdminPanelSettingsIcon sx={{ fontSize: '2.5rem' }} />
          </IconButton>
        )
      }
      <Tooltip
        title={streak > 0 ? `${streak} day streak` : 'Insights'}
        enterTouchDelay={0}
        leaveTouchDelay={2500}
        arrow
      >
        <IconButton onClick={handleInsights} sx={{ ...iconButtonStyle }} aria-label="insights">
          <Badge
            badgeContent={streak}
            invisible={!streak || streak === 0}
            overlap="rectangular"
            sx={{
              '& .MuiBadge-badge': {
                // Rating-3 from the day-rating palette — warm "streak" tone
                // that pops against the otherwise-grey icon row without
                // shouting like a notification-red would.
                backgroundColor: DayRatingColors[3],
                color: '#ffffff',
                fontSize: '0.7rem',
                fontWeight: 500,
                minWidth: '20px',
                height: '20px',
                borderRadius: '10px',
                padding: '0 6px',
                // Nudge inward so the pill kisses the corner of the icon
                transform: 'scale(1) translate(15%, -15%)'
              }
            }}
          >
            <BarChartIcon sx={{ fontSize: '2.5rem' }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <IconButton onClick={handleSettings} sx={{ ...iconButtonStyle }}>
        <SettingsIcon sx={{ fontSize: '2.5rem' }} /> {/* Adjust icon size here */}
      </IconButton>
      <IconButton onClick={handleLogout} sx={{ ...iconButtonStyle }}>
        <PowerSettingsNewIcon sx={{ fontSize: '2.5rem' }} /> {/* Adjust icon size here */}
      </IconButton>
    </Box>
  );
};

export default Menu;
