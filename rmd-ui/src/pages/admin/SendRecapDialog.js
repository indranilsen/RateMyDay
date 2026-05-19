import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button
} from '@mui/material';

// Simple confirm-only dialog for sending the ad-hoc monthly recap. Unlike
// DeleteUserDialog / BulkDeleteDialog (which require typing the user's email
// or the word DELETE), this is a single Send button. Sending the recap is
// non-destructive — worst case a user gets an extra recap they could
// already opt out of via Settings — so a typed confirmation would be
// disproportionate friction.
//
// Caller passes either `user` (single) or `count` (bulk); we pick the
// appropriate copy from those.
const SendRecapDialog = ({ open, user, count, onClose, onConfirm, busy }) => {
  const isBulk = typeof count === 'number';

  const title = isBulk
    ? `Send monthly recap to ${count} user${count === 1 ? '' : 's'}?`
    : 'Send monthly recap?';

  const body = isBulk
    ? `This sends each selected user a recap email for the previous month
       (in their local timezone). Users with no ratings in that window are
       skipped automatically.`
    : user
      ? `This sends ${user.first_name} ${user.last_name} (${user.email}) a
         recap email for the previous month, computed in their local timezone.
         If they have no ratings in that window the send is skipped.`
      : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          disabled={busy}
        >
          {busy ? 'Sending…' : (isBulk ? `Send ${count}` : 'Send')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SendRecapDialog;
