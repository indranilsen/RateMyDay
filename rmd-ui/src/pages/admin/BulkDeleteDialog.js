import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button,
  Typography
} from '@mui/material';

// Bulk-confirm dialog: type the literal word DELETE to enable the button.
// Cheaper UX than typing each user's email when deleting many at once.
const CONFIRM_WORD = 'DELETE';

const BulkDeleteDialog = ({ open, count, onClose, onConfirm, busy }) => {
  const [typed, setTyped] = useState('');
  const canDelete = typed === CONFIRM_WORD;

  const handleClose = () => {
    setTyped('');
    onClose();
  };

  const handleConfirm = async () => {
    if (!canDelete) return;
    await onConfirm();
    setTyped('');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete {count} user{count === 1 ? '' : 's'}?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This will permanently delete <strong>{count}</strong> user account
          {count === 1 ? '' : 's'} and all of their ratings and settings.
          Admins and your own account will be skipped automatically. This cannot be undone.
        </DialogContentText>
        <DialogContentText sx={{ mb: 2 }}>
          Type <Typography component="span" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>{CONFIRM_WORD}</Typography> to confirm:
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          placeholder={CONFIRM_WORD}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          color="error"
          variant="contained"
          disabled={!canDelete || busy}
        >
          {busy ? 'Deleting...' : `Delete ${count}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkDeleteDialog;
