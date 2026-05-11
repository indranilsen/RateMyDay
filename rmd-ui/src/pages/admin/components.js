// Shared visual primitives for the admin pages so System Stats and User Detail
// (and anything else we add) stay consistent.
import React from 'react';
import { Box, Paper, Typography, LinearProgress } from '@mui/material';
import DayRatingColors from '../../RatingColor';

// Map a 0-100 health percentage to a color from the day-rating palette.
// "Health" here is inverted: 0% usage = best (rating 10, green); 100% = worst (rating 1, red).
// Lets the admin panel reuse the same hand-picked palette as the rest of the app.
export const colorForPercent = (pct) => {
  const safe = Math.min(100, Math.max(0, pct));
  // 0..10% -> rating 10, 10..20% -> rating 9, ..., 90..100% -> rating 1
  const rating = Math.max(1, Math.min(10, 10 - Math.floor(safe / 10)));
  return DayRatingColors[rating];
};

// Quick-glance label/value card. `accent` paints a thin colored stripe on the
// left edge — use it sparingly when the color carries semantic meaning
// (e.g. role badge, health summary). Omit it for neutral stats.
export const StatCard = ({ label, value, caption, accent }) => (
  <Paper
    elevation={1}
    sx={{
      p: 2,
      height: '100%',
      borderLeft: accent ? `3px solid ${accent}` : 'none'
    }}
  >
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        color: 'grey',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        mb: 0.5
      }}
    >
      {label}
    </Typography>
    <Typography variant="h6" sx={{ fontWeight: '200', color: '#505050', wordBreak: 'break-word' }}>
      {value}
    </Typography>
    {caption && (
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'grey' }}>
        {caption}
      </Typography>
    )}
  </Paper>
);

// Section header — small uppercase grey label above a panel
export const SectionHeading = ({ children }) => (
  <Typography
    variant="overline"
    sx={{
      display: 'block',
      mb: 1,
      color: 'grey',
      letterSpacing: '0.1em'
    }}
  >
    {children}
  </Typography>
);

// Horizontal stacked bar visualizing the proportions of a small set of
// categories. Honest about dominant categories (one long segment + thin
// slivers) where a pie chart would just look like a uniform disc.
// `segments` is an array of { label, value, color } in display order.
export const StackedBar = ({ segments, height = 10 }) => {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          height,
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: '#eee'
        }}
      >
        {total === 0 ? null : segments.map((s, i) => {
          const pct = (s.value || 0) / total * 100;
          if (pct === 0) return null;
          return (
            <Box
              key={i}
              title={`${s.label}: ${s.value}`}
              sx={{
                width: `${pct}%`,
                backgroundColor: s.color,
                // Hairline divider between segments so adjacent same-ish colors
                // remain distinguishable
                borderRight: i < segments.length - 1 ? '1px solid rgba(255,255,255,0.6)' : 'none'
              }}
            />
          );
        })}
      </Box>
      {/* Legend: small color dot + label + numeric count. Renders even when a
          segment has zero so the reader can see which categories were checked. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
        {segments.map((s, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color }} />
            <Typography variant="caption" sx={{ color: 'grey' }}>
              {s.label} · {s.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Labeled progress bar with a right-aligned value caption.
// `color` lets the caller paint the filled portion in a meaningful color
// (e.g. graded by health via colorForPercent).
export const MetricBar = ({ label, percent, caption, color }) => (
  <Box sx={{ mb: 1.5 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
      <Typography variant="body2" sx={{ color: 'grey', letterSpacing: '0.04em' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: 'grey' }}>
        {caption}
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={Math.min(100, Math.max(0, percent))}
      sx={{
        height: 8,
        borderRadius: 1,
        backgroundColor: '#eee',
        '& .MuiLinearProgress-bar': {
          backgroundColor: color || '#787878'
        }
      }}
    />
  </Box>
);
