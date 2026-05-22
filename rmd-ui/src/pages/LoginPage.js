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
        <Typography component="h1" variant="h5">Sign In</Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
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
          />
          {error && <Typography color="error" variant="body2">{error}</Typography>}
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>Sign In</Button>
          <Button component={Link} to="/register" fullWidth variant="text" sx={{ mt: 1 }}>Register</Button>
        </Box>
      </Box>
    </Container>
  );
}

export default LoginPage;
