import React from 'react';
import { Box, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import { useColorMode } from '../ThemeContext';

// Custom pill toggle styled after a neumorphic "LIGHT MODE / DARK MODE"
// switch. The label sits on the side opposite the thumb, and the thumb's
// icon shows the current mode, so the control reads at a glance.
//
// Responsive: on small screens we drop the text label and shrink the pill
// to just-the-thumb so it doesn't crowd the nav. The slide animation still
// communicates state.
const ThemeToggle = () => {
  const { mode, toggle } = useColorMode();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const isDark = mode === 'dark';

  // Hand-picked colors keyed on the active mode. Muted-grey family to fit
  // with the rest of the nav's restrained palette.
  const track = isDark
    ? { bg: '#1f1f1f', border: '#404040', label: '#e0e0e0', thumbBg: '#e0e0e0', iconColor: '#404040' }
    : { bg: '#f0f0f0', border: '#dcdcdc', label: '#606060', thumbBg: '#ffffff', iconColor: '#787878' };

  const Icon = isDark ? DarkModeOutlinedIcon : WbSunnyOutlinedIcon;

  // Dimensions: compact (mobile) keeps the pill chunky enough to tap easily
  // while dropping the text label. Desktop is sized so the label ~touches
  // the thumb's edge with a tight ~12px gap — wider felt loose.
  const pillWidth = isCompact ? 88 : 140;
  const pillHeight = 40;
  const thumbSize = 34;
  const thumbInset = 3;

  return (
    <Tooltip
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      enterTouchDelay={0}
      leaveTouchDelay={2500}
      arrow
    >
      <Box
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
        role="button"
        tabIndex={0}
        aria-label="toggle theme"
        aria-pressed={isDark}
        sx={{
          position: 'relative',
          width: pillWidth,
          height: pillHeight,
          borderRadius: pillHeight / 2,
          backgroundColor: track.bg,
          border: '1px solid',
          borderColor: track.border,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background-color 0.25s, border-color 0.25s',
          outline: 'none',
          '&:focus-visible': { boxShadow: '0 0 0 2px rgba(120,120,120,0.4)' }
        }}
      >
        {/* Label — only on roomy viewports. Inset 18px from its edge so it
            stays clear of the thumb (which is 3px inset on its own side). */}
        {!isCompact && (
          <Typography
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              // When light mode, thumb is on the right; the label takes the
              // left half. When dark, swap.
              left: isDark ? 'auto' : 14,
              right: isDark ? 14 : 'auto',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: track.label,
              transition: 'color 0.25s',
              whiteSpace: 'nowrap'
            }}
          >
            {isDark ? 'DARK MODE' : 'LIGHT MODE'}
          </Typography>
        )}

        {/* Thumb — round disc with the current-mode icon. Slides between the
            two ends of the pill on toggle. */}
        <Box
          sx={{
            position: 'absolute',
            top: thumbInset,
            left: isDark ? thumbInset : `calc(100% - ${thumbSize + thumbInset}px)`,
            width: thumbSize,
            height: thumbSize,
            borderRadius: '50%',
            backgroundColor: track.thumbBg,
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'left 0.25s, background-color 0.25s'
          }}
        >
          <Icon sx={{ fontSize: '1.2rem', color: track.iconColor }} />
        </Box>
      </Box>
    </Tooltip>
  );
};

export default ThemeToggle;
