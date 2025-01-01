import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import Fuse from 'fuse.js';
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

const AdminPage = () => {
  const [stats, setStats] = useState({});
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [recipientType, setRecipientType] = useState('all');

  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');

  // Fuzzy search config
  const fuseOptions = {
    keys: ['email', 'first_name', 'last_name'],
    threshold: 0.3
  };

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, []);

  // Fetch system stats
  const fetchStats = async () => {
    try {
      const response = await axios.get(`${ENDPOINT_PREFIX}/api/admin/stats`, { withCredentials: true });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats', error);
    }
  };

  // Fetch all users for the multi-select
  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${ENDPOINT_PREFIX}/api/admin/users`, { withCredentials: true });
      setAllUsers(response.data);
      setFilteredUsers(response.data); // start with all
    } catch (error) {
      console.error('Error fetching users list', error);
    }
  };

  // Update filtered users whenever searchTerm or allUsers changes
  useEffect(() => {
    if (!searchTerm) {
      setFilteredUsers(allUsers);
    } else {
      const fuse = new Fuse(allUsers, fuseOptions);
      const results = fuse.search(searchTerm);
      setFilteredUsers(results.map(r => r.item));
    }
  }, [searchTerm, allUsers]);

  const handleSendEmail = async () => {
    try {
      const payload = {
        subject: emailSubject,
        body: emailBody,
        recipientType,
        emails: selectedEmails
      };
      await axios.post(`${ENDPOINT_PREFIX}/api/admin/send-emails`, payload, { withCredentials: true });
      alert('Emails sent successfully!');
      // Reset fields
      setEmailSubject('');
      setEmailBody('');
      setSelectedEmails([]);
      setRecipientType('all');
      setSearchTerm('');
    } catch (error) {
      console.error('Error sending emails', error);
      alert('Could not send emails.');
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={0} sx={{ p: 2, maxWidth: '800px', margin: 'auto' }}>
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
          Admin Panel
        </Typography>

        {/* System Stats Section */}
        <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>
          System Stats
        </Typography>
        <Paper elevation={1} sx={{ p: 2, mb: 4 }}>
          <Typography>Hostname: {stats.hostname || 'N/A'}</Typography>
          <Typography>Node Version: {stats.nodeVersion || 'N/A'}</Typography>

          {/* CPU loads */}
          <Typography>CPU Load (1m): {stats.cpuLoad1m || 'N/A'}</Typography>
          <Typography>CPU Load (5m): {stats.cpuLoad5m || 'N/A'}</Typography>
          <Typography>CPU Load (15m): {stats.cpuLoad15m || 'N/A'}</Typography>
          <Typography>CPU Load Avg: {stats.cpuLoadAvg || 'N/A'}</Typography>

          {/* Memory */}
          <Typography>Memory Usage: {stats.memoryUsage || 'N/A'}</Typography>

          {/* Disk */}
          <Typography>Disk Usage: {stats.diskUsage || 'N/A'}</Typography>

          {/* # of users */}
          <Typography>Number of Users: {stats.userCount || 'N/A'}</Typography>

          {/* Uptime */}
          <Typography>App Uptime: {stats.uptime || 'N/A'}</Typography>
        </Paper>

        {/* Section: Send Ad-hoc Emails */}
        <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>
          Send Ad-hoc Emails
        </Typography>
        <TextField
          label="Subject"
          fullWidth
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          sx={{ mt: 2 }}
        />
        <TextField
          label="Body"
          fullWidth
          multiline
          rows={4}
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          sx={{ mt: 2 }}
        />

        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Recipient Type</InputLabel>
          <Select
            value={recipientType}
            label="Recipient Type"
            onChange={(e) => setRecipientType(e.target.value)}
          >
            <MenuItem value="all">All Users</MenuItem>
            <MenuItem value="subset">Select Users</MenuItem>
          </Select>
        </FormControl>

        {/* Show search & multi-select ONLY if "subset" */}
        {recipientType === 'subset' && (
          <>
            <TextField
              label="Search Users"
              fullWidth
              sx={{ mt: 2 }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel id="emails-label">Select Users</InputLabel>
              <Select
                labelId="emails-label"
                multiple
                value={selectedEmails}
                onChange={(e) => setSelectedEmails(e.target.value)}
                label="Select Users"
                renderValue={(selected) => selected.join(', ')}
              >
                {filteredUsers.map(user => {
                  const displayName = `${user.email} (${user.first_name}, ${user.last_name})`;
                  return (
                    <MenuItem key={user.email} value={user.email}>
                      {displayName}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </>
        )}

        <Button
          variant="contained"
          onClick={handleSendEmail}
          sx={{ mt: 2 }}
        >
          Send Email
        </Button>
      </Paper>
    </Box>
  );
};

export default AdminPage;
