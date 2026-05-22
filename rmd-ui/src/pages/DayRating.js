import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { Button, TextField, Box, Typography, Paper, Snackbar, Alert } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useNavigate, useParams } from 'react-router-dom';
import DayRatingColors from '../RatingColor'
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

const DayRating = () => {
  const { year, month, day } = useParams();
  const navigate = useNavigate();

  // Determine the date based on the parameters or default to today's date
  const determineDate = () => {
    if (year && month && day) {
      // Months are 0-indexed in JavaScript Date
      return new Date(year, month - 1, day);
    }
    return new Date();
  };

  // Set the initial date state based on the parameters or default to today
  // Initial state for date is set using the determineDate function
  const [date, setDate] = useState(() => determineDate(year, month, day));
  const [rating, setRating] = useState(null);
  const [note, setNote] = useState('');
  // Save state — when the POST fails (network blip, session expired,
  // server error) we surface the failure as a Snackbar and keep the
  // form state intact instead of silently swallowing the error and
  // navigating away. Losing a day's note to a transient error is the
  // worst-case UX for a journaling app.
  const [saving, setSaving] = useState(false);
  const [errorFlash, setErrorFlash] = useState('');

  useEffect(() => {
    const handleUnauthorized = () => {
        navigate('/login');
      };

    window.addEventListener('unauthorized', handleUnauthorized);

    // Use the year, month, and day from the route if they exist, otherwise default to today's date
    const selectedDate = year && month && day
      ? new Date(parseInt(year), parseInt(month) - 1, parseInt(day)) // Months are 0-indexed in JS
      : new Date();
    setDate(selectedDate);

    const fetchRating = async () => {
      try {
        // Fetch against the date derived from the current params, not the
        // closed-over `date` state — `setDate` above hasn't been applied yet.
        const ratingDate = format(selectedDate, 'yyyy-MM-dd');
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/submit-rating`, {
          withCredentials: true,
          params: { ratingDate }
        });
        if (response.data) {
          setRating(response.data.rating);
          setNote(response.data.note || '');
        }
      } catch (error) {
        console.error('Error fetching rating', error);
        if (error.response && error.response.status === 403) {
          navigate('/login');
        }
      }
    };

    fetchRating();

    return () => {
        window.removeEventListener('unauthorized', handleUnauthorized);
      };

  }, [year, month, day, navigate]);

  const handleRatingChange = (newRating) => {
    setRating(newRating);
  };

  const handleNoteChange = (event) => {
    setNote(event.target.value);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ratingDate = format(date, 'yyyy-MM-dd');
      await axios.post(`${ENDPOINT_PREFIX}/api/ratings/submit-rating`, {
        ratingDate,
        rating,
        note
      }, {
        withCredentials: true
      });
      navigate(`/month-view/${format(date, 'yyyy')}/${format(date, 'MM')}`);
    } catch (error) {
      console.error('Error submitting rating', error);
      // Don't navigate, don't clear the form — show the user what went
      // wrong and let them retry. The interceptor will still bounce a
      // 401/403 to /login (with `?next=` so they return here), so the
      // common "session expired" case auto-recovers; for everything
      // else (5xx, network failure, etc.) the user's note is preserved.
      const status = error.response && error.response.status;
      if (status === 401 || status === 403) {
        return; // unauthorized handler / interceptor takes over
      }
      setErrorFlash('Could not save. Your note is still here — try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={0} sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <Typography variant="h4" align="center" sx={{ 
        m: 2,
        fontWeight: '100', 
        marginBottom: '1em',
        color: 'grey', 
        letterSpacing: '0.06em',
        textTransform: 'uppercase'
        }}>
        {format(date, 'MMM dd, yyyy')}
      </Typography>
        {/* Rating buttons: 5x2 grid on mobile (symmetric, full-width touch
            targets, no awkward wrap), single 10-cell row on desktop. CSS grid
            with `minmax(0, 1fr)` lets cells stretch to fill the row evenly
            instead of fixed-pixel widths that overflow narrow viewports. */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(5, minmax(0, 1fr))',
            sm: 'repeat(10, minmax(0, 1fr))'
          },
          gap: 1,
          width: '100%',
          maxWidth: { sm: '720px' },
          mb: 3,
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <Button
              key={value}
              variant={rating === value ? 'contained' : 'outlined'}
              onClick={() => handleRatingChange(value)}
              sx={{
                minWidth: 0,
                width: '100%',
                aspectRatio: '1 / 1',
                border: '1px solid',
                borderColor: 'divider',
                color: rating === value ? '#ffffff' : 'text.secondary',
                bgcolor: rating === value ? DayRatingColors[value] : 'transparent',
                // Hover preview is mouse/trackpad only. On touchscreens
                // (`hover: none`) the tap would trigger :hover and the
                // browser would keep that state until the user tapped
                // elsewhere — making the rating look stuck on the wrong
                // value. Gating with `@media (hover: hover)` skips the
                // hover paint on touch entirely; selection is driven only
                // by the `rating === value` check above.
                '@media (hover: hover)': {
                  '&:hover': {
                    border: '1px solid',
                    borderColor: 'divider',
                    color: '#ffffff',
                    bgcolor: DayRatingColors[value],
                  },
                },
              }}
            >
              {value}
            </Button>
          ))}
        </Box>
        <TextField
            label="Note"
            multiline
            rows={4}
            value={note}
            onChange={handleNoteChange}
            variant="outlined"
            sx={{
                mb: 3,
                // Full-width on mobile, ~80% on roomy viewports. The previous
                // `width: 60% + minWidth: 80%` always resolved to 80%, masking
                // the intent — make the responsive rule explicit.
                width: { xs: '100%', sm: '80%' },
                marginTop: '1em',
                letterSpacing: '0.06em',
            }}
            InputLabelProps={{
                sx: {
                color: 'gray', 
                '&.Mui-focused': {
                    color: 'gray',
                },
                },
            }}
            InputProps={{
                sx: {
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'gray',
                },
                },
            }}
        />
        <Button elevation={0} variant="outlined" onClick={handleSave} disabled={saving} endIcon={<SaveIcon />} sx={{
            mb: 3,
            boxShadow: 'none',
            // Theme-aware so this doesn't render as white-on-dark in dark mode
            border: '1px solid',
            borderColor: 'text.secondary',
            color: 'text.secondary',
            backgroundColor: 'background.paper',
            marginTop: '1em',
            letterSpacing: '0.06em',
            '&:hover': {
                color: 'background.paper',
                backgroundColor: 'text.secondary',
                borderColor: 'text.secondary',
                boxShadow: 'none',
              },
            '&:active': {
                backgroundColor: 'text.secondary',
                borderColor: 'text.secondary',
                borderWidth: '2px',
                boxShadow: 'none',
            }
            }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Paper>

      <Snackbar
        open={Boolean(errorFlash)}
        autoHideDuration={6000}
        onClose={() => setErrorFlash('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorFlash('')}>
          {errorFlash}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DayRating;
