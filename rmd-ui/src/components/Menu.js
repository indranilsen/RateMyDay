import React from 'react';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import SettingsIcon from '@mui/icons-material/Settings';
import { IconButton, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

const Menu = ({ isMobile }) => {
  const navigate = useNavigate();

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
