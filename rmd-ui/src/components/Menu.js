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
  //
  // Badge visibility is driven by `current !== acknowledged` (not just
  // `current > 0`): clicking Insights writes `lastSeenStreak = current`
  // server-side, so the badge hides until the streak grows or a fresh
  // streak starts after a break. Using `!==` instead of `>` means a fresh
  // 1-day streak after a reset still notifies (1 !== <previous-ack>).
  const [streak, setStreak] = useState(null);
  const [acknowledged, setAcknowledged] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const fetchStreak = async () => {
      try {
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/streak`, { withCredentials: true });
        if (!cancelled) {
          setStreak(response.data.current);
          setAcknowledged(response.data.acknowledged || 0);
        }
      } catch (err) {
        // Non-essential — silently leave the badge off
        if (!cancelled) setStreak(null);
      }
    };
    fetchStreak();
    return () => { cancelled = true; };
  }, [location.pathname]);

  const showStreakBadge = Boolean(streak) && streak !== acknowledged;

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
    // Optimistically clear the badge so the click feels instant, then fire
    // the ack in the background. If the network call fails, the next
    // route-change refetch will simply restore the real server state — so
    // a transient failure means the badge briefly reappears, which is the
    // right fail-mode (better than showing a wrong "you have an unseen
    // streak" indicator).
    if (streak && streak !== acknowledged) {
      const seen = streak;
      setAcknowledged(seen);
      axios.post(`${ENDPOINT_PREFIX}/api/ratings/streak/ack`, { streak: seen }, { withCredentials: true })
        .catch((err) => console.warn('Streak ack failed', err));
    }
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
      display: 'flex',
      alignItems: 'center',
      position: isMobile ? 'relative' : 'absolute', // Only position absolutely on non-mobile
      right: 0,
      top: isMobile ? 0 : 'auto', // Adjust top only for mobile
      // Tighter on mobile: a 4-icon row + the theme pill was crowding the
      // edges on a 375px viewport. Each IconButton also drops its default
      // 12px padding to 6px on mobile to claw back ~24px across the row.
      padding: { xs: '4px', sm: '10px' },
      height: { xs: '48px', sm: '64px' }
    }}>
      {isAdmin &&
        (
          <IconButton onClick={() => navigate('/admin')} sx={{ ...iconButtonStyle, p: { xs: 0.75, sm: 1 } }}>
            <AdminPanelSettingsIcon sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' } }} />
          </IconButton>
        )
      }
      <Tooltip
        title={streak > 0 ? `${streak} day streak` : 'Insights'}
        enterTouchDelay={0}
        leaveTouchDelay={2500}
        arrow
      >
        <IconButton onClick={handleInsights} sx={{ ...iconButtonStyle, p: { xs: 0.75, sm: 1 } }} aria-label="insights">
          <Badge
            badgeContent={streak}
            invisible={!showStreakBadge}
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
            <BarChartIcon sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' } }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <IconButton onClick={handleSettings} sx={{ ...iconButtonStyle, p: { xs: 0.75, sm: 1 } }}>
        <SettingsIcon sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' } }} />
      </IconButton>
      <IconButton onClick={handleLogout} sx={{ ...iconButtonStyle, p: { xs: 0.75, sm: 1 } }}>
        <PowerSettingsNewIcon sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' } }} />
      </IconButton>
    </Box>
  );
};

export default Menu;
