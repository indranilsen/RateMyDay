import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { TextField, Button, Box, Typography, Container } from '@mui/material';
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// Match the muted-grey styling shared with LoginPage so /register doesn't
// stand out as a blue-on-blue MUI default page.
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

function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '', // Assuming date format is 'YYYY-MM-DD'
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      await axios.post(`${ENDPOINT_PREFIX}/api/users/register`, formData);
      navigate('/login'); // Navigate to the login page upon successful registration
    } catch (err) {
      setError(err.response?.data?.message || 'Error in registration');
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
          Register
        </Typography>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="firstName"
            label="First Name"
            name="firstName"
            autoFocus
            value={formData.firstName}
            onChange={handleChange}
            sx={textFieldSx}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="lastName"
            label="Last Name"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            sx={textFieldSx}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="dob"
            label="Date of Birth"
            name="dob"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={formData.dob}
            onChange={handleChange}
            sx={textFieldSx}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
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
            value={formData.password}
            onChange={handleChange}
            sx={textFieldSx}
          />
          {error && <Typography color="error" variant="body2">{error}</Typography>}
          <Button type="submit" fullWidth variant="outlined" sx={primaryButtonSx}>Register</Button>
          <Button component={Link} to="/login" fullWidth variant="text" sx={linkButtonSx}>Already have an account? Sign In</Button>
        </Box>
      </Box>
    </Container>
  );
}

export default RegisterPage;
