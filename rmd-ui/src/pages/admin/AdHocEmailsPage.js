import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Autocomplete,
  Typography
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { marked } from 'marked';

import config from '../../Config';
import { SectionHeading } from './components';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// We keep two separate drafts so toggling between modes is non-destructive.
// Send picks the right one based on `useMarkdown` and converts on the way out.
const AdHocEmailsPage = () => {
  const location = useLocation();

  const [emailSubject, setEmailSubject] = useState('');
  const [richBody, setRichBody] = useState('');
  const [markdownBody, setMarkdownBody] = useState('');
  const [useMarkdown, setUseMarkdown] = useState(false);
  const [recipientType, setRecipientType] = useState('all');

  // Full user list once, then Autocomplete handles filtering as you type
  const [allUsers, setAllUsers] = useState([]);
  // The Autocomplete works in terms of user objects; we extract emails on send
  const [selectedUsers, setSelectedUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // The /users endpoint is paginated; grab a large page (server cap is 100).
        // If the user base ever exceeds that, this picker needs its own paginated UI.
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/admin/users?limit=100`, { withCredentials: true });
        const users = response.data.users || [];
        setAllUsers(users);
      } catch (error) {
        console.error('Error fetching users list', error);
      }
    };
    fetchUsers();
  }, []);

  // If we arrived from Manage Users with a pre-selected list (the "Email"
  // bulk action), flip into subset mode and pre-populate selected users
  // once the full list has loaded so we can resolve emails to user objects.
  useEffect(() => {
    const prefill = location.state && location.state.prefillEmails;
    if (!prefill || prefill.length === 0) return;
    if (allUsers.length === 0) return;
    setRecipientType('subset');
    const matched = allUsers.filter(u => prefill.includes(u.email));
    setSelectedUsers(matched);
    window.history.replaceState({}, document.title);
  }, [allUsers, location.state]);

  // Live-render the markdown preview. Memoized so we don't reparse on every
  // keystroke unrelated to the body. marked() output is trusted in preview
  // (it's the admin's own input); the backend sanitizes before send.
  const markdownPreviewHtml = useMemo(() => {
    if (!useMarkdown) return '';
    try {
      return marked(markdownBody || '', { breaks: true });
    } catch (err) {
      console.error('Markdown render error', err);
      return '';
    }
  }, [useMarkdown, markdownBody]);

  const handleSendEmail = async () => {
    // Whichever editor is active is the source of truth. Convert markdown to
    // HTML here; the backend further sanitizes before delivering.
    const finalBody = useMarkdown ? marked(markdownBody || '') : richBody;

    const payload = {
      subject: emailSubject,
      body: finalBody,
      recipientType,
      emails: selectedUsers.map(u => u.email)
    };

    try {
      await axios.post(`${ENDPOINT_PREFIX}/api/admin/send-emails`, payload, { withCredentials: true });
      alert('Emails sent successfully!');
      setEmailSubject('');
      setRichBody('');
      setMarkdownBody('');
      setUseMarkdown(false);
      setSelectedUsers([]);
      setRecipientType('all');
    } catch (error) {
      console.error('Error sending emails', error);
      alert('Could not send emails.');
    }
  };

  return (
    <Box>
      <TextField
        label="Subject"
        fullWidth
        value={emailSubject}
        onChange={(e) => setEmailSubject(e.target.value)}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={useMarkdown}
            onChange={(e) => setUseMarkdown(e.target.checked)}
          />
        }
        label="Markdown Mode"
        sx={{ mt: 1 }}
      />

      {/* Rich text mode: ReactQuill is the only editor. No raw "Body" field. */}
      {!useMarkdown && (
        <Box sx={{ mt: 1 }}>
          <ReactQuill
            theme="snow"
            value={richBody}
            onChange={setRichBody}
            placeholder="Type your rich text email here..."
            style={{ minHeight: '200px' }}
          />
        </Box>
      )}

      {/* Markdown mode: source on the left, rendered preview on the right.
          Stacks vertically on narrow screens so each pane still gets full width. */}
      {useMarkdown && (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <SectionHeading>Markdown</SectionHeading>
            <TextField
              fullWidth
              multiline
              minRows={12}
              value={markdownBody}
              onChange={(e) => setMarkdownBody(e.target.value)}
              placeholder={`# Hi there\n\nWrite your message in **markdown**.\n\n- bullet\n- another\n\n[link](https://example.com)`}
              InputProps={{
                sx: { fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: '0.85rem' }
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <SectionHeading>Preview</SectionHeading>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                minHeight: '300px',
                border: '1px solid #ddd',
                borderRadius: 1,
                backgroundColor: '#fafafa',
                color: '#333',
                // Clip anything that escapes (long URLs, fenced code blocks)
                // so the panel doesn't blow out its column width
                overflow: 'hidden',
                // Tighten the default browser margins on rendered markdown so
                // headings/lists don't look adrift in the preview pane
                '& h1, & h2, & h3': { mt: 1, mb: 1, fontWeight: 300, color: '#505050' },
                '& p': { my: 1, overflowWrap: 'anywhere' },
                '& ul, & ol': { my: 1, pl: 3 },
                '& a': { color: '#1976d2', overflowWrap: 'anywhere' },
                // Fenced code blocks: scroll horizontally inside their own
                // box rather than overflowing the preview. Inline <code>
                // inside <pre> drops its pill background (the <pre> already
                // has one) so it doesn't look double-shaded.
                '& pre': {
                  backgroundColor: '#eee',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  overflowX: 'auto',
                  maxWidth: '100%',
                  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                  fontSize: '0.85rem',
                  lineHeight: 1.4
                },
                '& pre code': {
                  backgroundColor: 'transparent',
                  padding: 0,
                  borderRadius: 0
                },
                '& code': {
                  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                  fontSize: '0.85rem',
                  backgroundColor: '#eee',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  // Break inline code that has no spaces so it doesn't push
                  // the column wider than the grid allows
                  overflowWrap: 'anywhere'
                }
              }}
            >
              {markdownBody.trim() === '' ? (
                <Typography variant="body2" sx={{ color: 'grey', fontStyle: 'italic' }}>
                  Preview appears here as you type.
                </Typography>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: markdownPreviewHtml }} />
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

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

      {/* Subset mode: single Autocomplete picker — filters by typing and shows
          chips for selected recipients. */}
      {recipientType === 'subset' && (
        <Autocomplete
          multiple
          options={allUsers}
          value={selectedUsers}
          onChange={(e, newValue) => setSelectedUsers(newValue)}
          getOptionLabel={(u) => `${u.email} (${u.first_name} ${u.last_name})`}
          isOptionEqualToValue={(option, value) => option.email === value.email}
          filterSelectedOptions
          renderInput={(params) => (
            <TextField
              {...params}
              label="Recipients"
              placeholder="Type to search by email or name"
            />
          )}
          sx={{ mt: 2 }}
        />
      )}

      <Button
        variant="outlined"
        onClick={handleSendEmail}
        endIcon={<SendIcon />}
        sx={{
          mt: '1em',
          mb: 3,
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'text.secondary',
          color: 'text.secondary',
          backgroundColor: 'background.paper',
          letterSpacing: '0.06em',
          '&:hover': {
            color: 'background.paper',
            backgroundColor: 'text.secondary',
            borderColor: 'text.secondary',
            boxShadow: 'none'
          },
          '&:active': {
            backgroundColor: 'text.secondary',
            borderColor: 'text.secondary',
            borderWidth: '2px',
            boxShadow: 'none'
          }
        }}
      >
        Send Email
      </Button>
    </Box>
  );
};

export default AdHocEmailsPage;
