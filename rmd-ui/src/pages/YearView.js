import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, parseISO, getDaysInYear, addDays, isBefore, endOfDay, isSameMonth } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { Grid, Box, Tooltip, Typography, Paper, Tabs, Tab } from '@mui/material';
import DayRatingColors from '../RatingColor';
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

const YearView = () => {
  const [ratings, setRatings] = useState({});
  const [availableYears, setAvailableYears] = useState([]);
  const navigate = useNavigate();
  const { year: paramYear } = useParams();
  const [hoveredMonth, setHoveredMonth] = useState(-1);
  const isMobileSize = window.matchMedia("(max-width: 600px)").matches;

  useEffect(() => {
    const fetchAvailableYears = async () => {
      try {
        const yearResponse = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/available-years`, {
          withCredentials: true
        });
        setAvailableYears(yearResponse.data.sort((a, b) => b - a)); // Sort years in descending order
      } catch (error) {
        console.error('Error fetching available years', error);
      }
    };

    fetchAvailableYears();
  }, []);

  useEffect(() => {
    availableYears.forEach(async (year) => {
      try {
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/year-data`, {
          params: { year },
          withCredentials: true
        });
        setRatings(prevRatings => ({ ...prevRatings, [year]: response.data }));
      } catch (error) {
        console.error(`Error fetching year data for ${year}`, error);
      }
    });
  }, [availableYears]);

  const getRatingColor = (date, year) => {
    const ratingForDate = ratings[year]?.find(r => format(parseISO(r.rating_date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
    return ratingForDate ? DayRatingColors[ratingForDate.rating] : 'transparent';
  };

  const handleCellClick = (date, year) => {
    if (isBefore(date, endOfDay(new Date()))) {
      navigate(`/day-rating/${format(date, 'yyyy/MM/dd')}`);
    }
  };

  const renderMonthTabs = (year) => {
    return (
      <Tabs
        value={false}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          mb: 2,
          maxWidth: '100%', // Ensures tabs are only as wide as their content
        }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <Tab
            key={index}
            label={format(new Date(year, index), 'MMM')}
            onMouseEnter={() => setHoveredMonth(index)}
            onMouseLeave={() => setHoveredMonth(-1)}
            onClick={() => navigate(`/month-view/${year}/${index + 1}`)}
            sx={{
              minWidth: 60, 
              padding: '6px 12px',
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
              '&:hover': {
                backgroundColor: 'rgba(224, 224, 224, 0.4)',
              },
            }}
          />
        ))}
      </Tabs>
    );
  };

  const renderGrid = (year) => {
    const startDate = new Date(year, 0, 1);
    const daysInYear = getDaysInYear(startDate);
    let cells = [];

    for (let i = 0; i < daysInYear; i++) {
      const cellDate = addDays(startDate, i);
      const color = getRatingColor(cellDate, year);
      const isClickable = isBefore(cellDate, endOfDay(new Date()));
      const applyHoverEffect = hoveredMonth !== -1 && !isSameMonth(cellDate, new Date(year, hoveredMonth));

      cells.push(
        <Grid item key={i} sx={{ width: '14px', height: '14px', margin: '3px' }}>
          <Tooltip title={format(cellDate, 'MMM d')} placement="top" disableTouchListener={!isClickable}>
            <Box
              onClick={() => isClickable && handleCellClick(cellDate, year)}
              sx={{
                width: '14px',
                height: '14px',
                backgroundColor: applyHoverEffect ? color + '55' : color,
                border: '1px solid grey',
                borderRadius: '2px',
                cursor: isClickable ? 'pointer' : 'default',
                opacity: isClickable ? 1 : 0.4,
              }}
            />
          </Tooltip>
        </Grid>
      );
    }

    return (
      <Paper elevation={0} sx={{
        width: isMobileSize ? '100%' : '60%',
        maxWidth: 'calc(100vw - 64px)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: '32px', // Add some space between year grids
        '&:last-child': {
          marginBottom: '0px', // Remove margin bottom from the last grid
        },
      }}>
        <Typography variant="h5" sx={{ 
            mb: 1, 
            width: '100%', 
            textAlign: 'center', 
            marginTop: '16px', 
            fontWeight: '100', 
            color: 'grey', 
            letterSpacing: '0.06em' }}>
          {year}
        </Typography>
        {renderMonthTabs(year)}
        <Grid container justifyContent="center">
          {cells}
        </Grid>
      </Paper>
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 'calc(100vw - 64px)', margin: 'auto' }}>
        {availableYears.map(year => (
          <Box key={year} sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            {renderGrid(year)}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default YearView;
