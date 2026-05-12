import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Typography,
  Button,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import config from '../../Config';
import DeleteUserDialog from './DeleteUserDialog';
import { StatCard } from './components';
import DayRatingColors from '../../RatingColor';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// Format an ISO-ish timestamp to YYYY-MM-DD; null becomes a muted "Never"
const formatDate = (val) => {
  if (!val) return 'Never';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toISOString().split('T')[0];
};

// Human-readable "X days" / "Y years, Z months" account age
const formatAccountAge = (createdAt) => {
  if (!createdAt) return 'N/A';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return String(createdAt);
  const now = new Date();
  const diffMs = now - created;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return `${years} year${years === 1 ? '' : 's'}${remMonths ? `, ${remMonths} mo` : ''}`;
};

const UserDetailPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorSnack, setErrorSnack] = useState('');

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${ENDPOINT_PREFIX}/api/admin/users/${userId}`, { withCredentials: true });
      setUser(response.data);
    } catch (err) {
      console.error('Error loading user', err);
      if (err.response && err.response.status === 404) {
        setError('User not found.');
      } else {
        setError('Failed to load user.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await axios.delete(
        `${ENDPOINT_PREFIX}/api/admin/users/${user.id}`,
        {
          data: { confirmEmail: user.email },
          withCredentials: true
        }
      );
      // Pass a flash message through navigation state so the list page shows
      // a snackbar after the redirect.
      navigate('/admin/users', { state: { flash: `Deleted ${user.email}` } });
    } catch (err) {
      console.error('Error deleting user', err);
      const message = (err.response && err.response.data && err.response.data.message) || 'Failed to delete user.';
      setErrorSnack(message);
      setDialogOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Typography color="error">{error}</Typography>;
  }
  if (!user) {
    return null;
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/admin/users')}
        sx={{ mb: 2, color: 'grey', letterSpacing: '0.06em' }}
      >
        Back to users
      </Button>

      {/* Header — match the muted grey aesthetic of the rest of the app */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: '100',
          color: 'text.primary',
          letterSpacing: '0.04em',
          mb: 0.5
        }}
      >
        {user.first_name} {user.last_name}
      </Typography>
      <Typography variant="body2" sx={{ color: 'grey', mb: 3, letterSpacing: '0.04em' }}>
        {user.email}
      </Typography>

      {/* Stat cards — same primitive used on System Stats so the two pages
          read as one design language. The Role card uses a palette accent so
          admins are visually distinct from regular users at a glance. */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard
            label="Role"
            value={user.user_role}
            accent={user.user_role === 'admin' ? DayRatingColors[4] : DayRatingColors[9]}
          />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard
            label="Account age"
            value={formatAccountAge(user.created_at)}
            caption={`created ${formatDate(user.created_at)}`}
          />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Total ratings" value={user.ratingCount} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Last rating" value={formatDate(user.lastRatingDate)} />
        </Grid>
      </Grid>

      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={() => setDialogOpen(true)}
      >
        Delete User
      </Button>

      <DeleteUserDialog
        open={dialogOpen}
        user={user}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDelete}
        busy={deleting}
      />

      <Snackbar
        open={Boolean(errorSnack)}
        autoHideDuration={5000}
        onClose={() => setErrorSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorSnack('')}>
          {errorSnack}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default UserDetailPage;
