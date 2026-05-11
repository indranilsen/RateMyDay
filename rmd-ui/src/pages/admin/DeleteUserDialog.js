import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button
} from '@mui/material';

// Confirm-by-typing dialog. The Delete button stays disabled until the input
// exactly equals the target user's email. onConfirm is invoked only when
// that match holds; the parent owns the actual API call.
const DeleteUserDialog = ({ open, user, onClose, onConfirm, busy }) => {
  const [typed, setTyped] = useState('');

  const targetEmail = user ? user.email : '';
  const canDelete = typed === targetEmail && typed.length > 0;

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
      <DialogTitle>Delete user?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This will permanently delete <strong>{user ? `${user.first_name} ${user.last_name}` : ''}</strong>
          {' '}({targetEmail}) and all their ratings and settings.
          This cannot be undone.
        </DialogContentText>
        <DialogContentText sx={{ mb: 2 }}>
          To confirm, type the user's email below:
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          placeholder={targetEmail}
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
          {busy ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteUserDialog;
