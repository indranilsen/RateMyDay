import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import axios from 'axios';

import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// Endpoint hit by the rating buttons inside reminder emails:
//   /rate?date=YYYY-MM-DD&value=1..10
// We submit the rating immediately, then drop the user on the day-rating
// page for that date so they can optionally add a note. If the session
// cookie is missing the global axios interceptor will bounce them to /login.
const RateRedirect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    // The global interceptor handles 401/403 (sends an "unauthorized" event).
    // Listen here so a fresh-tab visit without a session lands on /login
    // instead of getting stuck on the loading spinner.
    const handleUnauthorized = () => navigate('/login');
    window.addEventListener('unauthorized', handleUnauthorized);

    const date = searchParams.get('date');
    const value = parseInt(searchParams.get('value'), 10);

    // Sanity-check the params — they come from the email URL so a typo or
    // a tampered link shouldn't 500 the API; just show a friendly error.
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value < 1 || value > 10) {
      setError('That rating link looks invalid.');
      return () => window.removeEventListener('unauthorized', handleUnauthorized);
    }

    const submit = async () => {
      try {
        await axios.post(
          `${ENDPOINT_PREFIX}/api/ratings/submit-rating`,
          { ratingDate: date, rating: value, note: '' },
          { withCredentials: true }
        );
        const [y, m, d] = date.split('-');
        // Land on the day page so the user can refine the rating or add a note
        navigate(`/day-rating/${y}/${m}/${d}`, { replace: true });
      } catch (err) {
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          // Interceptor already fired 'unauthorized' — handler above redirects
          return;
        }
        console.error('Error submitting rating from email link', err);
        setError('Could not save the rating. Please try again from the app.');
      }
    };

    submit();
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [searchParams, navigate]);

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ color: 'grey' }}>{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress />
    </Box>
  );
};

export default RateRedirect;
