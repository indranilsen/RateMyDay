import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
  CircularProgress
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RefreshIcon from '@mui/icons-material/Refresh';

import config from '../../Config';
import { StatCard, SectionHeading } from './components';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;
const POLL_INTERVAL_MS = 5000;
const LOG_LINES = 100;

const formatBytes = (b) => {
  if (b == null) return 'N/A';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
};

const formatPmUptime = (pmUptimeMs) => {
  if (!pmUptimeMs) return 'N/A';
  const sec = Math.floor((Date.now() - pmUptimeMs) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
};

const OperationsPage = () => {
  const [status, setStatus] = useState(null);
  // `unavailable` is true when the backend responded 503 — typically dev mode
  // (no PM2). We render a single explanatory message instead of empty cards.
  const [unavailable, setUnavailable] = useState(false);

  const [logType, setLogType] = useState('out');
  const [logLines, setLogLines] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [restartOpen, setRestartOpen] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [flashSeverity, setFlashSeverity] = useState('success');

  const statusTimerRef = useRef(null);
  const logsTimerRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${ENDPOINT_PREFIX}/api/admin/pm2/status`, { withCredentials: true });
      setStatus(response.data);
      setUnavailable(false);
    } catch (err) {
      if (err.response && err.response.status === 503) {
        setUnavailable(true);
        setStatus(null);
      } else {
        console.error('Error fetching pm2 status', err);
      }
    }
  }, []);

  const fetchLogs = useCallback(async (type) => {
    setLogsLoading(true);
    try {
      const response = await axios.get(
        `${ENDPOINT_PREFIX}/api/admin/pm2/logs?type=${type}&lines=${LOG_LINES}`,
        { withCredentials: true }
      );
      setLogLines(response.data.lines || []);
    } catch (err) {
      if (err.response && err.response.status === 503) {
        setUnavailable(true);
      } else {
        console.error('Error fetching pm2 logs', err);
      }
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Poll status and the currently-active log type. Each gets its own timer so
  // a log refresh doesn't block the status refresh and vice versa.
  useEffect(() => {
    fetchStatus();
    statusTimerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, [fetchStatus]);

  useEffect(() => {
    fetchLogs(logType);
    logsTimerRef.current = setInterval(() => fetchLogs(logType), POLL_INTERVAL_MS);
    return () => {
      if (logsTimerRef.current) clearInterval(logsTimerRef.current);
    };
  }, [logType, fetchLogs]);

  const handleRestart = async () => {
    setRestartBusy(true);
    try {
      await axios.post(`${ENDPOINT_PREFIX}/api/admin/pm2/restart`, {}, { withCredentials: true });
      setFlashSeverity('success');
      setFlash('Reload initiated. Refreshing status in a few seconds…');
      setRestartOpen(false);
      // Give PM2 a moment to swap the process before we re-poll
      setTimeout(() => fetchStatus(), 3000);
    } catch (err) {
      console.error('Error triggering restart', err);
      setFlashSeverity('error');
      setFlash('Failed to trigger reload');
    } finally {
      setRestartBusy(false);
    }
  };

  if (unavailable) {
    return (
      <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" sx={{ color: 'grey', mb: 1 }}>
          Operations are only available when the app is managed by PM2.
        </Typography>
        <Typography variant="caption" sx={{ color: 'grey' }}>
          You're likely running in local dev (SQLite backend, plain <code>node server.js</code>). Deploy to the droplet to see this tab in action.
        </Typography>
      </Paper>
    );
  }

  if (!status) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Color the status card based on PM2's reported state — green when online,
  // yellow when launching/restarting, red when stopped/errored.
  const statusAccent = (s) => {
    if (s === 'online') return '#5eca64';
    if (s === 'launching' || s === 'one-launch-status') return '#ffd24f';
    return '#ff3e36';
  };

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Status" value={status.status} accent={statusAccent(status.status)} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="PID" value={status.pid || 'N/A'} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Restarts" value={status.restarts} caption={status.unstableRestarts ? `${status.unstableRestarts} unstable` : undefined} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="PM2 uptime" value={formatPmUptime(status.pmUptime)} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Memory" value={formatBytes(status.memoryBytes)} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="CPU" value={status.cpuPercent != null ? `${status.cpuPercent}%` : 'N/A'} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Exec mode" value={status.execMode || 'N/A'} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Node" value={status.nodeVersion || 'N/A'} />
        </Grid>
      </Grid>

      {/* Restart panel — red accent on the button via color="error" picks up
          the rating-1 red from the admin theme. Always behind a confirmation. */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <SectionHeading>Process control</SectionHeading>
        <Typography variant="body2" sx={{ color: 'grey', mb: 2 }}>
          Triggers <code>pm2 reload RateMyDay</code> — a graceful restart that
          drains in-flight requests, picks up new env values, and replaces the
          worker.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<RestartAltIcon />}
          onClick={() => setRestartOpen(true)}
        >
          Reload server
        </Button>
      </Paper>

      {/* Log viewer — tabs switch the source; auto-refresh keeps it live */}
      <Paper elevation={1} sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <SectionHeading>Logs (last {LOG_LINES} lines)</SectionHeading>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => fetchLogs(logType)}
            disabled={logsLoading}
            sx={{ color: 'grey' }}
          >
            Refresh
          </Button>
        </Box>
        <Tabs
          value={logType}
          onChange={(e, v) => setLogType(v)}
          sx={{ mb: 1, borderBottom: '1px solid #eee', minHeight: '36px' }}
        >
          <Tab value="out" label="stdout" sx={{ fontSize: '0.8rem', minHeight: '36px' }} />
          <Tab value="err" label="stderr" sx={{ fontSize: '0.8rem', minHeight: '36px' }} />
        </Tabs>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            backgroundColor: '#fafafa',
            border: '1px solid #eee',
            borderRadius: 1,
            maxHeight: '480px',
            overflow: 'auto',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: '12px',
            lineHeight: '1.4',
            color: '#404040',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}
        >
          {logLines.length === 0 ? '(no log lines)' : logLines.join('\n')}
        </Box>
      </Paper>

      <Dialog open={restartOpen} onClose={() => setRestartOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reload server?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This triggers a graceful PM2 reload of the RateMyDay process.
            Any in-flight HTTP requests should complete; new requests will be
            served by the new worker. The session store is unaffected.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestartOpen(false)} disabled={restartBusy} sx={{ color: 'grey' }}>
            Cancel
          </Button>
          <Button onClick={handleRestart} color="error" variant="contained" disabled={restartBusy}>
            {restartBusy ? 'Reloading...' : 'Reload'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(flash)}
        autoHideDuration={4000}
        onClose={() => setFlash('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={flashSeverity} onClose={() => setFlash('')}>
          {flash}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default OperationsPage;
