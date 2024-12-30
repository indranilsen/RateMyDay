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
import moment from 'moment-timezone';
import config from '../Config';

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

  const userOffset = moment.tz(userTz).utcOffset(); // offset in minutes from UTC
  let bestMatch = 'UTC';
  let bestDelta = Infinity;

  majorTimezones.forEach((tz) => {
    const offset = moment.tz(tz).utcOffset();
    const delta = Math.abs(offset - userOffset);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestMatch = tz;
    }
  });

  return bestMatch;
}

const SettingsPage = () => {
  // Attempt to detect the browser's exact local zone
  // If that fails, default to 'UTC'
  const browserTimeZone = moment.tz.guess() || 'UTC';
  // Map it to the "closest" major zone
  const defaultTimeZone = findClosestMajorTimezone(browserTimeZone);

  // Default settings
  const [settings, setSettings] = useState({
    sendReminders: false,
    reminderCadence: 'daily',
    reminderTime: '20:00',
    localTimezone: defaultTimeZone
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

        {/* Send Reminders */}
        <FormControlLabel
          control={
            <Switch
              checked={settings.sendReminders}
              onChange={(e) => handleChange('sendReminders', e.target.checked)}
              color="primary"
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

        {/* Save Button */}
        <Button
          variant="outlined"
          onClick={handleSave}
          endIcon={<SaveIcon />}
          sx={{
            mt: 4,
            border: '1px solid grey',
            color: 'grey',
            backgroundColor: 'white',
            letterSpacing: '0.06em',
            '&:hover': {
              color: 'white',
              backgroundColor: 'grey',
              border: '1px solid grey',
              boxShadow: 'none'
            },
            '&:active': {
              backgroundColor: 'grey',
              border: '2px solid grey',
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
