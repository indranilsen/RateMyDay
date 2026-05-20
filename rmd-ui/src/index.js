import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import './common.css';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

// Create a theme instance
const theme = createTheme();

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

// Register the service worker so the app is installable and works offline.
// No-op in development; see ./serviceWorkerRegistration for details.
serviceWorkerRegistration.register();
