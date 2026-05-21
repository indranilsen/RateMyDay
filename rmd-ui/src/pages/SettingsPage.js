import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Paper,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  Button,
  FormControl,
  Grid
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import config from '../Config';
import { useColorMode } from '../ThemeContext';

// Native replacement for `moment.tz(zone).utcOffset()` — returns the
// offset in minutes from UTC for the given IANA timezone. Drops the
// moment-timezone dep (~150 KiB pre-gzip with all the timezone data).
// Works by formatting "now" as if in the target TZ, parsing those parts
// as if they were UTC, and diffing against actual UTC.
const tzOffsetMinutes = (tz) => {
  try {
    const now = Date.now();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(now).reduce((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
    // Some locales emit "24" for midnight — normalize to 0 to keep Date.UTC happy
    let h = parseInt(parts.hour, 10);
    if (h === 24) h = 0;
    const asIfUtc = Date.UTC(
      parseInt(parts.year, 10),
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      h,
      parseInt(parts.minute, 10),
      parseInt(parts.second, 10)
    );
    return Math.round((asIfUtc - now) / 60000);
  } catch (e) {
    return 0;
  }
};

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

/**
 * Hourly options (0..23). We store "HH:00" strings in state, e.g. "09:00"
 */
const hourOptions = Array.from({ length: 24 }).map((_, i) => {
  const hourValue = i.toString().padStart(2, '0') + ':00';
  let label = '';
  if (i === 0) {
    label = '12 AM';
  } else if (i < 12) {
    label = `${i} AM`;
  } else if (i === 12) {
    label = '12 PM';
  } else {
    label = `${i - 12} PM`;
  }
  return { label, value: hourValue };
});

/**
 * A curated list of major time zones.
 */
const majorTimezones = [
  'Pacific/Honolulu',     // Hawaii
  'America/Anchorage',    // Alaska
  'America/Los_Angeles',  // Pacific
  'America/Denver',       // Mountain
  'America/Chicago',      // Central
  'America/New_York',     // Eastern
  'America/Toronto',      // Eastern Canada
  'America/Sao_Paulo',    // São Paulo (Brazil)
  'Europe/London',        // London
  'Europe/Berlin',        // Berlin (Central Europe)
  'Africa/Johannesburg',  // South Africa
  'Asia/Dubai',           // UAE
  'Asia/Kolkata',         // India
  'Asia/Shanghai',        // China
  'Asia/Tokyo',           // Japan
  'Australia/Sydney',     // New South Wales
  'UTC'
];

/**
 * Given the user's local (IANA) time zone, find the "closest" zone in majorTimezones
 * by comparing offsets. If the user's local zone is already in the list, we pick it directly.
 */
function findClosestMajorTimezone(userTz) {
  // If it's already in the list, just return it
  if (majorTimezones.includes(userTz)) {
    return userTz;
  }

  const userOffset = tzOffsetMinutes(userTz);
  let bestMatch = 'UTC';
  let bestDelta = Infinity;

  majorTimezones.forEach((tz) => {
    const offset = tzOffsetMinutes(tz);
    const delta = Math.abs(offset - userOffset);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestMatch = tz;
    }
  });

  return bestMatch;
}

const SettingsPage = () => {
  // Theme preference: stored client-side via ThemeContext (localStorage), so
  // changes apply immediately and are per-device — no Save click required.
  const { preference, setPreference } = useColorMode();

  // Attempt to detect the browser's exact local zone via native Intl
  // (replaces moment.tz.guess()); default to 'UTC' if unavailable.
  const browserTimeZone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  // Map it to the "closest" major zone
  const defaultTimeZone = findClosestMajorTimezone(browserTimeZone);

  // Default settings
  const [settings, setSettings] = useState({
    sendReminders: false,
    reminderCadence: 'daily',
    reminderTime: '20:00',
    localTimezone: defaultTimeZone,
    sendMonthlyRecap: false
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/settings`, {
          withCredentials: true
        });
        // Merge the fetched settings with our defaults
        setSettings(prev => ({ ...prev, ...response.data }));
      } catch (error) {
        console.error('Error fetching settings', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await axios.post(`${ENDPOINT_PREFIX}/api/settings`, settings, {
        withCredentials: true
      });
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings', error);
      alert('Could not save settings.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={0} sx={{ p: 2, maxWidth: '600px', margin: 'auto' }}>
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
          Settings
        </Typography>

        {/* Appearance — theme preference applies immediately (client-side, no Save) */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="theme-preference-label">Theme</InputLabel>
          <Select
            labelId="theme-preference-label"
            id="theme-preference-select"
            label="Theme"
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
          >
            <MenuItem value="light">Light</MenuItem>
            <MenuItem value="dark">Dark</MenuItem>
            <MenuItem value="system">Match System (Auto)</MenuItem>
          </Select>
        </FormControl>

        {/* Send Reminders — muted grey palette to match the rest of the nav/
            buttons. MUI's default Switch is blue (theme.palette.primary), which
            clashes with the day-rating app's restrained palette in both modes. */}
        <FormControlLabel
          control={
            <Switch
              checked={settings.sendReminders}
              onChange={(e) => handleChange('sendReminders', e.target.checked)}
              sx={(theme) => {
                // Override BOTH off + on states (not just on) — MUI's default
                // unchecked thumb in dark mode is already near-white, so
                // brightening only the ON thumb left the two states looking
                // identical. We drive OFF down to a dim thumb on a very-dim
                // track, and ON to a bright thumb on a medium-grey track.
                const isDark = theme.palette.mode === 'dark';
                return {
                  '& .MuiSwitch-switchBase': {
                    color: isDark ? theme.palette.grey[700] : theme.palette.grey[400]
                  },
                  '& .MuiSwitch-switchBase + .MuiSwitch-track': {
                    backgroundColor: isDark ? theme.palette.grey[900] : theme.palette.grey[400],
                    opacity: 1
                  },
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: isDark ? theme.palette.grey[100] : theme.palette.grey[800],
                    '&:hover': { backgroundColor: theme.palette.action.hover }
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: isDark ? theme.palette.grey[500] : theme.palette.grey[600],
                    opacity: 0.9
                  }
                };
              }}
            />
          }
          label="Send Reminders"
          sx={{ display: 'block', mb: 3, color: 'grey' }}
        />

        {/* Reminder Cadence (Daily or Weekly) */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel id="reminder-cadence-label">Reminder Cadence</InputLabel>
          <Select
            labelId="reminder-cadence-label"
            id="reminder-cadence-select"
            label="Reminder Cadence"
            value={settings.reminderCadence}
            onChange={(e) => handleChange('reminderCadence', e.target.value)}
          >
            <MenuItem value="daily">Daily</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
          </Select>
        </FormControl>

        {/* Row: Reminder Time + Time Zone */}
        <Grid container spacing={2}>
          {/* Reminder Time */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel id="reminder-time-label">Reminder Time</InputLabel>
              <Select
                labelId="reminder-time-label"
                id="reminder-time-select"
                label="Reminder Time"
                value={settings.reminderTime}
                onChange={(e) => handleChange('reminderTime', e.target.value)}
              >
                {hourOptions.map(({ label, value }) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Local Time Zone (from curated majorTimezones) */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel id="local-timezone-label">Time Zone</InputLabel>
              <Select
                labelId="local-timezone-label"
                id="local-timezone-select"
                label="Time Zone"
                value={settings.localTimezone}
                onChange={(e) => handleChange('localTimezone', e.target.value)}
              >
                {majorTimezones.map((tz) => (
                  <MenuItem key={tz} value={tz}>
                    {tz}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Monthly recap — separate opt-in. Independent of daily/weekly
            reminders so users can want one without the other. Lands on the
            1st of each month at their existing reminder time. */}
        <FormControlLabel
          sx={{ display: 'block', mt: 3, color: 'grey' }}
          control={
            <Switch
              checked={settings.sendMonthlyRecap}
              onChange={(e) => handleChange('sendMonthlyRecap', e.target.checked)}
              sx={(theme) => {
                const isDark = theme.palette.mode === 'dark';
                return {
                  '& .MuiSwitch-switchBase': {
                    color: isDark ? theme.palette.grey[700] : theme.palette.grey[400]
                  },
                  '& .MuiSwitch-switchBase + .MuiSwitch-track': {
                    backgroundColor: isDark ? theme.palette.grey[900] : theme.palette.grey[400],
                    opacity: 1
                  },
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: isDark ? theme.palette.grey[100] : theme.palette.grey[800],
                    '&:hover': { backgroundColor: theme.palette.action.hover }
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: isDark ? theme.palette.grey[500] : theme.palette.grey[600],
                    opacity: 0.9
                  }
                };
              }}
            />
          }
          label="Send Monthly Recap"
        />
        <Typography variant="caption" sx={{ display: 'block', color: 'grey', mt: 0.5, ml: 5 }}>
          Sent on the 1st with last month's average, days rated, and highlights.
        </Typography>

        {/* Save Button */}
        <Button
          variant="outlined"
          onClick={handleSave}
          endIcon={<SaveIcon />}
          sx={{
            mt: 4,
            border: '1px solid',
            borderColor: 'divider',
            color: 'text.secondary',
            backgroundColor: 'background.paper',
            letterSpacing: '0.06em',
            '&:hover': {
              color: 'background.paper',
              backgroundColor: 'text.secondary',
              border: '1px solid',
              borderColor: 'text.secondary',
              boxShadow: 'none'
            },
            '&:active': {
              backgroundColor: 'text.secondary',
              border: '2px solid',
              borderColor: 'text.secondary',
              boxShadow: 'none'
            }
          }}
        >
          Save Settings
        </Button>
      </Paper>
    </Box>
  );
};

export default SettingsPage;
