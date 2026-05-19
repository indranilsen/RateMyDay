import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Button,
  Checkbox,
  CircularProgress,
  Snackbar,
  Alert,
  Paper
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';

import config from '../../Config';
import BulkDeleteDialog from './BulkDeleteDialog';
import SendRecapDialog from './SendRecapDialog';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;
const PAGE_SIZE = 10;

const ManageUsersPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  // The text in the input field — updates every keystroke
  const [searchInput, setSearchInput] = useState('');
  // The debounced version we actually search against
  const [searchTerm, setSearchTerm] = useState('');

  // Set of selected user ids. We keep selection scoped to the user objects
  // currently in `users` — once a row scrolls out via a new search, it can
  // re-appear and still show as selected.
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Bulk action dialog state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRecapOpen, setBulkRecapOpen] = useState(false);
  const [bulkRecapBusy, setBulkRecapBusy] = useState(false);

  // Flash message passed via navigation state (e.g. "Deleted alice@local.dev").
  // Two channels so failures don't render in the green success Alert:
  //   flash      -> success Snackbar
  //   errorFlash -> error Snackbar
  const [flash, setFlash] = useState(location.state && location.state.flash ? location.state.flash : '');
  const [errorFlash, setErrorFlash] = useState('');
  useEffect(() => {
    // Clear the flash from history so it doesn't reappear on refresh / back-nav
    if (location.state && location.state.flash) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // 1) Debounce searchInput -> searchTerm by 300ms
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 2) Whenever searchTerm changes, reset list and load first page
  const fetchPage = useCallback(async (offset, q, replace) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset)
      });
      if (q) params.set('q', q);
      const response = await axios.get(
        `${ENDPOINT_PREFIX}/api/admin/users?${params.toString()}`,
        { withCredentials: true }
      );
      const { users: page, total: t, hasMore: more } = response.data;
      setUsers(prev => replace ? page : [...prev, ...page]);
      setTotal(t);
      setHasMore(more);
    } catch (error) {
      console.error('Error fetching users', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset + reload whenever the debounced search term changes. Selection is
  // intentionally preserved across searches — the toolbar still shows what
  // you've picked even when those rows aren't currently visible.
  useEffect(() => {
    fetchPage(0, searchTerm, true);
  }, [searchTerm, fetchPage]);

  // 3) Infinite scroll via IntersectionObserver on a sentinel below the list.
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && hasMore && !loading) {
        fetchPage(users.length, searchTerm, false);
      }
    }, { rootMargin: '100px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [users.length, hasMore, loading, searchTerm, fetchPage]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchPage(users.length, searchTerm, false);
    }
  };

  const toggleId = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // "Select all on this page" toggles every visible user. If everything is
  // already selected, this clears the visible rows from the selection.
  const allVisibleSelected = users.length > 0 && users.every(u => selectedIds.has(u.id));
  const someVisibleSelected = users.some(u => selectedIds.has(u.id));
  const togglePage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        users.forEach(u => next.delete(u.id));
      } else {
        users.forEach(u => next.add(u.id));
      }
      return next;
    });
  };

  // Map selected ids -> user emails for the bulk-email handoff. We use the
  // currently-loaded users; if a selected user has scrolled out we drop
  // their email here, which is fine for the email use case (you'd reload).
  const selectedEmails = useMemo(() => {
    return users.filter(u => selectedIds.has(u.id)).map(u => u.email);
  }, [users, selectedIds]);

  const handleBulkEmail = () => {
    if (selectedEmails.length === 0) return;
    navigate('/admin/emails', { state: { prefillEmails: selectedEmails } });
  };

  const handleBulkRecap = async () => {
    setBulkRecapBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const response = await axios.post(
        `${ENDPOINT_PREFIX}/api/admin/users/bulk-send-recap`,
        { userIds: ids },
        { withCredentials: true }
      );
      const { sent, skipped } = response.data;
      const msg = skipped && skipped.length > 0
        ? `Sent recap to ${sent}. Skipped ${skipped.length} (no ratings / no email).`
        : `Sent recap to ${sent}.`;
      setFlash(msg);
      setBulkRecapOpen(false);
    } catch (err) {
      console.error('Error during bulk recap', err);
      setErrorFlash('Bulk recap send failed.');
      setBulkRecapOpen(false);
    } finally {
      setBulkRecapBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const response = await axios.post(
        `${ENDPOINT_PREFIX}/api/admin/users/bulk-delete`,
        { userIds: ids },
        { withCredentials: true }
      );
      const { deleted, skipped } = response.data;
      const msg = skipped && skipped.length > 0
        ? `Deleted ${deleted}. Skipped ${skipped.length} (admin/self/missing).`
        : `Deleted ${deleted}.`;
      setFlash(msg);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      // Reload from page 1 so the list reflects the deletions
      fetchPage(0, searchTerm, true);
    } catch (err) {
      console.error('Error during bulk delete', err);
      setErrorFlash('Bulk delete failed.');
      setBulkDeleteOpen(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const selectionCount = selectedIds.size;

  return (
    <Box>
      <TextField
        label="Search users"
        placeholder="Email, first name, or last name"
        fullWidth
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        sx={{ mb: 2 }}
      />

      {/* Bulk-action toolbar: appears whenever there's at least one selection.
          Uses the same muted palette as the rest of the panel; Delete picks up
          the rating-1 red via color="error". */}
      {selectionCount > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'action.hover'
          }}
        >
          <Typography variant="body2" sx={{ flexGrow: 1, color: 'grey', letterSpacing: '0.04em' }}>
            {selectionCount} selected
          </Typography>
          <Button
            size="small"
            startIcon={<MailOutlineIcon />}
            onClick={handleBulkEmail}
            sx={{ color: 'grey' }}
          >
            Email
          </Button>
          <Button
            size="small"
            startIcon={<InsightsOutlinedIcon />}
            onClick={() => setBulkRecapOpen(true)}
            sx={{ color: 'grey' }}
          >
            Recap
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setBulkDeleteOpen(true)}
          >
            Delete
          </Button>
          <Button
            size="small"
            onClick={() => setSelectedIds(new Set())}
            sx={{ color: 'grey' }}
          >
            Clear
          </Button>
        </Paper>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="body2" sx={{ color: 'grey', letterSpacing: '0.04em' }}>
          Showing {users.length} of {total}
        </Typography>
        {users.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'grey' }}>
            <Checkbox
              size="small"
              checked={allVisibleSelected}
              indeterminate={!allVisibleSelected && someVisibleSelected}
              onChange={togglePage}
              sx={{ color: 'grey' }}
            />
            <Typography variant="caption" sx={{ color: 'grey' }}>
              Select all
            </Typography>
          </Box>
        )}
      </Box>

      <List sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0 }}>
        {users.map((u, i) => (
          <ListItem key={u.id} disablePadding divider={i < users.length - 1}>
            <Checkbox
              size="small"
              checked={selectedIds.has(u.id)}
              onChange={() => toggleId(u.id)}
              onClick={(e) => e.stopPropagation()}
              sx={{ ml: 1, color: 'grey' }}
            />
            <ListItemButton onClick={() => navigate(`/admin/users/${u.id}`)}>
              <ListItemText
                primary={`${u.first_name} ${u.last_name}`}
                secondary={`${u.email}${u.user_role === 'admin' ? '  ·  admin' : ''}`}
              />
            </ListItemButton>
          </ListItem>
        ))}
        {users.length === 0 && !loading && (
          <ListItem>
            <ListItemText
              primary="No users match this search."
              primaryTypographyProps={{ color: 'grey', fontStyle: 'italic' }}
            />
          </ListItem>
        )}
      </List>

      {/* Sentinel for IntersectionObserver — invisible 1px element below the
          list. Kept out of the List itself so its divider/border don't render. */}
      <Box ref={sentinelRef} sx={{ height: 1 }} />

      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 2, gap: 2 }}>
        {loading && <CircularProgress size={20} />}
        {hasMore && !loading && (
          <Button variant="outlined" onClick={handleLoadMore} sx={{ color: 'grey', borderColor: 'grey' }}>
            Load more
          </Button>
        )}
        {!hasMore && users.length > 0 && (
          <Typography variant="caption" sx={{ color: 'grey' }}>
            End of list
          </Typography>
        )}
      </Box>

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        count={selectionCount}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        busy={bulkBusy}
      />

      <SendRecapDialog
        open={bulkRecapOpen}
        count={selectionCount}
        onClose={() => setBulkRecapOpen(false)}
        onConfirm={handleBulkRecap}
        busy={bulkRecapBusy}
      />

      <Snackbar
        open={Boolean(flash)}
        autoHideDuration={4000}
        onClose={() => setFlash('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setFlash('')}>
          {flash}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(errorFlash)}
        autoHideDuration={5000}
        onClose={() => setErrorFlash('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorFlash('')}>
          {errorFlash}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ManageUsersPage;
