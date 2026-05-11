import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Box,
  Grid,
  Paper,
  Typography
} from '@mui/material';

import config from '../../Config';
import Sparkline from './Sparkline';
import { StatCard, SectionHeading, MetricBar, StackedBar, colorForPercent } from './components';
import DayRatingColors from '../../RatingColor';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;
const POLL_INTERVAL_MS = 5000;
const SPARK_HISTORY = 60; // keep 60 samples ~ 5 min at 5s interval

const formatBytes = (b) => {
  if (b == null) return 'N/A';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
};

const formatUptime = (sec) => {
  if (sec == null) return 'N/A';
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
};

const SystemStatsPage = () => {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [rpmHistory, setRpmHistory] = useState([]);
  const timerRef = useRef(null);

  // 1) Initial fetch + recurring poll. The interval is cleared on unmount so
  // we don't leak timers when navigating to another tab.
  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        // Pull both endpoints in parallel — they're cheap and we want the
        // panels to update together so the page reads as one snapshot.
        const [statsResp, healthResp] = await Promise.all([
          axios.get(`${ENDPOINT_PREFIX}/api/admin/stats`, { withCredentials: true }),
          axios.get(`${ENDPOINT_PREFIX}/api/admin/health-metrics`, { withCredentials: true })
        ]);
        if (cancelled) return;
        setStats(statsResp.data);
        setHealth(healthResp.data);
        // Append the latest cpu avg to the rolling history
        setCpuHistory(prev => {
          const next = [...prev, statsResp.data.cpuLoad ? statsResp.data.cpuLoad.avg : 0];
          return next.length > SPARK_HISTORY ? next.slice(-SPARK_HISTORY) : next;
        });
        // And the same for request rate, so the Health panel gets a trend line
        setRpmHistory(prev => {
          const next = [...prev, healthResp.data.request ? healthResp.data.request.rpm : 0];
          return next.length > SPARK_HISTORY ? next.slice(-SPARK_HISTORY) : next;
        });
      } catch (err) {
        console.error('Error fetching stats', err);
      }
    };

    fetchOnce();
    timerRef.current = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!stats) {
    return <Typography sx={{ color: 'grey' }}>Loading…</Typography>;
  }

  // Derive percentages for the bars. CPU load is treated as load/cores so 1.0 on
  // an 8-core box is 12.5%. Memory and disk are straightforward used/total.
  const cores = stats.cpuCount || 1;
  const cpuPct = (n) => Math.min(100, (n / cores) * 100);
  const memPct = stats.memory && stats.memory.totalBytes
    ? (stats.memory.usedBytes / stats.memory.totalBytes) * 100
    : 0;
  const diskPct = stats.disk && stats.disk.totalBytes
    ? (stats.disk.usedBytes / stats.disk.totalBytes) * 100
    : 0;

  return (
    <Box>
      {/* Top row — quick-glance scalar cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Host" value={stats.hostname} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Node" value={stats.nodeVersion} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Users" value={stats.userCount} />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <StatCard label="Uptime" value={formatUptime(stats.uptimeSeconds)} />
        </Grid>
      </Grid>

      {/* CPU panel with three load bars and a live sparkline of the running avg.
          Bars and sparkline use the day-rating palette graded by load %. */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
          <SectionHeading>CPU Load · {cores} core{cores === 1 ? '' : 's'}</SectionHeading>
          <Typography variant="caption" sx={{ color: 'grey' }}>
            avg {stats.cpuLoad.avg.toFixed(2)}
          </Typography>
        </Box>
        <MetricBar
          label="1 min"
          percent={cpuPct(stats.cpuLoad.l1)}
          caption={stats.cpuLoad.l1.toFixed(2)}
          color={colorForPercent(cpuPct(stats.cpuLoad.l1))}
        />
        <MetricBar
          label="5 min"
          percent={cpuPct(stats.cpuLoad.l5)}
          caption={stats.cpuLoad.l5.toFixed(2)}
          color={colorForPercent(cpuPct(stats.cpuLoad.l5))}
        />
        <MetricBar
          label="15 min"
          percent={cpuPct(stats.cpuLoad.l15)}
          caption={stats.cpuLoad.l15.toFixed(2)}
          color={colorForPercent(cpuPct(stats.cpuLoad.l15))}
        />
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ color: 'grey', display: 'block', mb: 0.5 }}>
            Average load (last {cpuHistory.length} samples, 5s interval)
          </Typography>
          <Sparkline
            values={cpuHistory}
            width={640}
            height={60}
            min={0}
            stroke={colorForPercent(cpuPct(stats.cpuLoad.avg))}
            fill={`${colorForPercent(cpuPct(stats.cpuLoad.avg))}22`}
          />
        </Box>
      </Paper>

      {/* Memory panel — both system-wide and process-level so it's obvious how
          much of the box the Node process is consuming. */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <SectionHeading>Memory</SectionHeading>
        <MetricBar
          label="System"
          percent={memPct}
          caption={`${formatBytes(stats.memory.usedBytes)} / ${formatBytes(stats.memory.totalBytes)} (${memPct.toFixed(1)}%)`}
          color={colorForPercent(memPct)}
        />
        <Typography variant="caption" sx={{ color: 'grey', display: 'block', mt: 1 }}>
          Process RSS {formatBytes(stats.memory.rssBytes)} · Heap {formatBytes(stats.memory.heapUsedBytes)} / {formatBytes(stats.memory.heapTotalBytes)}
        </Typography>
      </Paper>

      {/* Disk panel — gracefully degrades if diskusage-ng failed to read the FS */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <SectionHeading>Disk</SectionHeading>
        {stats.disk ? (
          <MetricBar
            label="Root volume"
            percent={diskPct}
            caption={`${formatBytes(stats.disk.usedBytes)} / ${formatBytes(stats.disk.totalBytes)} (${diskPct.toFixed(1)}%)`}
            color={colorForPercent(diskPct)}
          />
        ) : (
          <Typography variant="body2" sx={{ color: 'grey' }}>Disk info unavailable.</Typography>
        )}
      </Paper>

      {/* Health & Activity — request counters and DB pool stats. Helps spot
          5xx spikes and connection-pool saturation at a glance. */}
      {health && (
        <Paper elevation={1} sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
            <SectionHeading>Health & Activity</SectionHeading>
            <Typography variant="caption" sx={{ color: 'grey' }}>
              last 5 min · {health.request.rpm.toFixed(1)} req/min
            </Typography>
          </Box>

          {/* Request rate trend — same sparkline pattern as CPU, so the eye
              already knows how to read it. */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'grey', display: 'block', mb: 0.5 }}>
              Request rate (req/min, last {rpmHistory.length} samples · 5s interval)
            </Typography>
            <Sparkline
              values={rpmHistory}
              width={640}
              height={60}
              min={0}
              stroke={DayRatingColors[9]}
              fill={`${DayRatingColors[9]}22`}
            />
          </Box>

          {/* Status-class breakdown (last 5 min) as a single stacked bar.
              More honest than a pie when 2xx dominates: 5xx still shows as a
              visible red sliver instead of being lost in a uniform green disc. */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'grey', display: 'block', mb: 0.5 }}>
              Status distribution (last 5 min · {health.request.windowCount} requests)
            </Typography>
            <StackedBar
              segments={[
                { label: '2xx', value: health.request.windowByStatus['2xx'], color: DayRatingColors[10] },
                { label: '3xx', value: health.request.windowByStatus['3xx'], color: DayRatingColors[7] },
                { label: '4xx', value: health.request.windowByStatus['4xx'], color: DayRatingColors[4] },
                { label: '5xx', value: health.request.windowByStatus['5xx'], color: DayRatingColors[1] }
              ]}
            />
          </Box>

          {/* DB pool — only meaningful for MySQL. SQLite is a single in-process
              connection, so we just say so to avoid showing a misleading zero. */}
          {health.pool ? (
            <Box>
              <Typography variant="caption" sx={{ color: 'grey', display: 'block', mb: 1 }}>
                DB pool · {health.pool.active} active · {health.pool.idle} idle · {health.pool.queued} queued · limit {health.pool.limit}
              </Typography>
              <MetricBar
                label="Pool utilization"
                percent={(health.pool.active / Math.max(1, health.pool.limit)) * 100}
                caption={`${health.pool.active} / ${health.pool.limit}`}
                color={colorForPercent((health.pool.active / Math.max(1, health.pool.limit)) * 100)}
              />
            </Box>
          ) : (
            <Typography variant="caption" sx={{ color: 'grey', display: 'block' }}>
              DB pool · single in-process SQLite connection
            </Typography>
          )}

          <Typography variant="caption" sx={{ color: 'grey', display: 'block', mt: 1 }}>
            Lifetime · {health.request.total} total ·
            {' '}{health.request.byStatus['2xx']}/{health.request.byStatus['3xx']}/{health.request.byStatus['4xx']}/{health.request.byStatus['5xx']} (2xx/3xx/4xx/5xx)
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default SystemStatsPage;
