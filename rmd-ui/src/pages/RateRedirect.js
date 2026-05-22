import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import axios from 'axios';

import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// Endpoint hit by the rating buttons inside reminder emails:
//   /rate?date=YYYY-MM-DD&value=1..10
// We submit the rating immediately, then drop the user on the day-rating
// page for that date so they can optionally add a note. If the session
// cookie is missing the global axios interceptor fires the "unauthorized"
// event; our listener forwards to /login but threads `?next=` through so
// post-login we land back on `/rate?…` and the rating still gets submitted.
const RateRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    // Preserve the original URL (path + query) so LoginPage can navigate
    // back to it after auth and the rating submit can complete naturally.
    // useLocation() returns the path with the Router basename already
    // stripped, so this is a clean relative path.
    const handleUnauthorized = () => {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(returnTo)}`, { replace: true });
    };
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
        // Intentionally OMIT the `note` field so the server preserves any
        // existing note on this date — the email button only conveys a
        // rating change, not a note edit. The submit-rating handler treats
        // a missing `note` as "keep what's there" (vs. an empty string,
        // which would explicitly clear the note).
        await axios.post(
          `${ENDPOINT_PREFIX}/api/ratings/submit-rating`,
          { ratingDate: date, rating: value },
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
  }, [searchParams, navigate, location.pathname, location.search]);

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
