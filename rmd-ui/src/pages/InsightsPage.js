import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Box, Grid, Paper, Typography, CircularProgress, Tooltip } from '@mui/material';
import { useNavigate } from 'react-router-dom';

import config from '../Config';
import DayRatingColors from '../RatingColor';
import { StatCard, SectionHeading } from './admin/components';
import Sparkline from './admin/Sparkline';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

// Direct mapping: rating 1..10 -> palette color. Higher rating = better,
// unlike the admin's colorForPercent which inverts because high usage = bad.
const colorForRating = (rating) => {
  if (rating == null) return '#eeeeee';
  const r = Math.max(1, Math.min(10, Math.round(rating)));
  return DayRatingColors[r];
};

// Short month name like "May '26" from a YYYY-MM key
const monthLabel = (yyyymm) => {
  const [y, m] = yyyymm.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m, 10) - 1]} '${y.slice(2)}`;
};

// Tooltip props tuned for both desktop hover and mobile tap-and-hold.
// `enterTouchDelay: 0` shows on first tap; `leaveTouchDelay: 2500` keeps it
// visible long enough to read; `arrow` gives a clear pointer to the source.
const tooltipBaseProps = {
  arrow: true,
  enterTouchDelay: 0,
  leaveTouchDelay: 2500,
  placement: 'top'
};

// A row of colored bars labeled per-category. Used for both day-of-week
// and monthly averages — same shape, different inputs. Values hidden by
// default; hover/tap a bar to see the number (no label repetition since
// the x-axis already names the column).
const RatingBarRow = ({ entries, maxRating = 10 }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 100 }}>
    {entries.map((e, i) => {
      const value = e.average;
      const heightPct = value == null ? 0 : (value / maxRating) * 100;
      const tooltipText = value == null ? '—' : value.toFixed(1);
      return (
        <Box key={i} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
          <Tooltip title={tooltipText} {...tooltipBaseProps}>
            <Box sx={{
              flex: 1,
              width: '100%',
              display: 'flex',
              alignItems: 'flex-end',
              cursor: 'pointer',
              // Full column is tappable on mobile even when the bar is short
              minHeight: 40
            }}>
              <Box
                sx={{
                  width: '100%',
                  height: `${heightPct}%`,
                  backgroundColor: colorForRating(value),
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s, filter 0.15s',
                  minHeight: value == null ? 0 : 2,
                  '&:hover': value == null ? {} : { filter: 'brightness(0.92)' }
                }}
              />
            </Box>
          </Tooltip>
          <Typography variant="caption" sx={{ mt: 0.5, color: 'grey', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
            {e.label}
          </Typography>
        </Box>
      );
    })}
  </Box>
);

// 30-day strip — small colored dots per day, gaps for unrated days.
// Tooltip is just the rating value (or em-dash). Touch target is padded
// invisibly so 14px dots are still easy to tap on mobile.
const RecentTrendStrip = ({ days }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
    {days.map((d, i) => {
      const tooltipText = d.rating == null ? '—' : String(d.rating);
      return (
        <Tooltip key={i} title={tooltipText} {...tooltipBaseProps}>
          <Box
            sx={{
              // Visible dot is 14px; tappable area is 22px with padding
              padding: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: '2px',
                backgroundColor: colorForRating(d.rating),
                border: d.rating == null ? '1px dashed #ddd' : 'none',
                boxSizing: 'border-box',
                transition: 'transform 0.15s',
                '&:hover': { transform: 'scale(1.2)' }
              }}
            />
          </Box>
        </Tooltip>
      );
    })}
  </Box>
);

const InsightsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => navigate('/login');
    window.addEventListener('unauthorized', handleUnauthorized);

    const load = async () => {
      try {
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/insights`, { withCredentials: true });
        setData(response.data);
      } catch (err) {
        console.error('Error loading insights', err);
        setError(true);
      }
    };
    load();

    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [navigate]);

  if (error) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: 'grey' }}>
        Couldn't load insights.
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Empty-state — friendly nudge for users who haven't rated anything yet
  if (data.totalRatings === 0) {
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
            Insights
          </Typography>
          <Typography align="center" sx={{ color: 'grey', mt: 4 }}>
            Rate a day or two and your insights will start appearing here.
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Sparkline of recent ratings — treat unrated days as 0 to show the dips.
  // The strip below carries the "missing day" information so the line being
  // visually low doesn't mislead.
  const sparkValues = data.recentTrend.map(d => d.rating == null ? 0 : d.rating);
  const sparkColor = colorForRating(data.averageRating);

  // Day-of-week + monthly rows share the same RatingBarRow shape. Counts
  // are passed through so the hover tooltip can show "(N ratings)".
  const dowEntries = data.dayOfWeekAverages.map(d => ({ label: d.day, average: d.average, count: d.count }));
  // monthlyAverages comes most-recent first; reverse so the chart reads
  // left-to-right as time advances
  const monthlyEntries = [...data.monthlyAverages]
    .reverse()
    .map(m => ({ label: monthLabel(m.month), average: m.average, count: m.count }));

  return (
    <Box sx={{ p: 2 }}>
      <Paper elevation={0} sx={{ p: 2, maxWidth: '900px', margin: 'auto' }}>
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
          Insights
        </Typography>

        {/* Headline stats — only the Average gets a colored accent; the
            streak cards stay neutral so the page doesn't feel busy. */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={6} md={3}>
            <StatCard
              label="Average"
              value={data.averageRating.toFixed(1)}
              accent={colorForRating(data.averageRating)}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <StatCard label="Days rated" value={data.totalRatings} />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <StatCard label="Current streak" value={data.currentStreak} />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <StatCard label="Longest streak" value={data.longestStreak} />
          </Grid>
        </Grid>

        {/* Chart sections — plain blocks separated by margin rather than
            individual Paper cards. Quieter, more breathing room. */}
        <Box sx={{ mb: 4 }}>
          <SectionHeading>Last 30 days</SectionHeading>
          <Box sx={{ mb: 2 }}>
            <RecentTrendStrip days={data.recentTrend} />
          </Box>
          <Sparkline
            values={sparkValues}
            width={640}
            height={50}
            min={0}
            max={10}
            stroke={sparkColor}
            fill={`${sparkColor}22`}
          />
        </Box>

        <Box sx={{ mb: 4 }}>
          <SectionHeading>By day of week</SectionHeading>
          <RatingBarRow entries={dowEntries} />
        </Box>

        <Box>
          <SectionHeading>Monthly averages</SectionHeading>
          <RatingBarRow entries={monthlyEntries} />
        </Box>
      </Paper>
    </Box>
  );
};

export default InsightsPage;
