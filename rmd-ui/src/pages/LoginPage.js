import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { TextField, Button, Box, Typography, Container } from '@mui/material';
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// Open-redirect guard — only allow same-origin relative paths. A safe path
// must start with `/` (so the router resolves it against this origin),
// not with `//` (protocol-relative external), and not with `/\\` (some
// URL parsers normalize backslashes to slashes, opening a side channel).
const isSafeNext = (p) =>
  typeof p === 'string'
  && p.startsWith('/')
  && !p.startsWith('//')
  && !p.startsWith('/\\');

// Shared form styling — pulls Login + Register into the same muted-grey
// palette the rest of the app uses (DayRating note field, Settings save
// button, etc.). Without these overrides MUI defaults to its primary blue
// for both the input focus ring and the contained Button.
const textFieldSx = {
  '& label.Mui-focused': { color: 'text.secondary' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'text.secondary'
  }
};
const primaryButtonSx = {
  mt: 3,
  mb: 2,
  border: '1px solid',
  borderColor: 'text.secondary',
  color: 'text.secondary',
  backgroundColor: 'background.paper',
  letterSpacing: '0.06em',
  boxShadow: 'none',
  '&:hover': {
    color: 'background.paper',
    backgroundColor: 'text.secondary',
    borderColor: 'text.secondary',
    boxShadow: 'none'
  }
};
const linkButtonSx = {
  mt: 1,
  color: 'text.secondary',
  letterSpacing: '0.04em',
  '&:hover': { backgroundColor: 'action.hover' }
};

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      const response = await axios.post(`${ENDPOINT_PREFIX}/api/users/login`, { email, password }, { withCredentials: true });
      const userRole = response.data.role;

      // Store userRole in localStorage or a React Context or Redux
      localStorage.setItem('userRole', userRole);

      // If we got here via a redirect (e.g. clicking an email's rate button
      // while logged out), `?next=` carries the original URL. After auth,
      // hand the user back to that destination so the flow they started
      // completes instead of dumping them on /month-view.
      const next = searchParams.get('next');
      if (isSafeNext(next)) {
        navigate(next, { replace: true });
      } else {
        navigate('/month-view');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error logging in');
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography
          component="h1"
          variant="h4"
          align="center"
          sx={{
            mb: 3,
            fontWeight: '100',
            color: 'grey',
            letterSpacing: '0.06em',
            textTransform: 'uppercase'
          }}
        >
          Sign In
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={textFieldSx}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={textFieldSx}
          />
          {error && <Typography color="error" variant="body2">{error}</Typography>}
          <Button type="submit" fullWidth variant="outlined" sx={primaryButtonSx}>Sign In</Button>
          <Button component={Link} to="/register" fullWidth variant="text" sx={linkButtonSx}>Register</Button>
        </Box>
      </Box>
    </Container>
  );
}

export default LoginPage;
