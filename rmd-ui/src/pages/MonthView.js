import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, isAfter } from 'date-fns';
import { Grid, Paper, Typography, Button, Box, Tooltip } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import DayRatingColors from '../RatingColor';
import { isSameDay } from 'date-fns';
import config from '../Config';

const ENDPOINT_PREFIX = config.ENDPOINT_PREFIX;

const parseUTCToLocal = (dateString) => {
  const date = new Date(dateString);
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() + userTimezoneOffset);
};

const MonthView = () => {
  const { year, month } = useParams();
  const navigate = useNavigate();
  
  const initialYear = year ? parseInt(year, 10) : new Date().getFullYear();
  const initialMonth = month ? parseInt(month, 10) - 1 : new Date().getMonth();

  const [currentMonth] = useState(new Date(initialYear, initialMonth));
  const [ratings, setRatings] = useState([]);

  const isMobileSize = window.matchMedia("(max-width: 600px)").matches;

  useEffect(() => {
    const handleUnauthorized = () => {
      navigate('/login');
    };

    window.addEventListener('unauthorized', handleUnauthorized);

    const fetchRatings = async () => {
      try {
        const response = await axios.get(`${ENDPOINT_PREFIX}/api/ratings/month-data`, {
          withCredentials: true,
          params: { year: format(currentMonth, 'yyyy'), month: format(currentMonth, 'MM') }
        });
        setRatings(response.data);
      } catch (error) {
        console.error('Error fetching ratings', error);
      }
    };

    fetchRatings();

    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [currentMonth, navigate]);

  const handleDayClick = (date) => {
    navigate(`/day-rating/${format(date, 'yyyy/MM/dd')}`);
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const getRatingColor = (rating) => DayRatingColors[rating] || 'transparent';

  const isDayClickable = (day) => isToday(day) || (isSameMonth(day, currentMonth) && !isAfter(day, new Date()));

  const getNoteIndicator = (note) => note && (
    <Box sx={{
      position: 'absolute',
      top: 4,
      right: 4,
      width: 10,
      height: 10,
      borderRadius: '50%',
      backgroundColor: 'grey'
    }} />
  );

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" align="center" sx={{ 
        m: 2,
        fontWeight: '100', 
        marginTop: '1em',
        marginBottom: '1em',
        color: 'grey', 
        letterSpacing: '0.06em',
        textTransform: 'uppercase'
        }}>
        {format(currentMonth, 'MMMM yyyy')}
      </Typography>
      <Paper elevation={0} sx={{ overflow: 'hidden', margin: 'auto', maxWidth: '600px' }}>
        <Grid container spacing={isMobileSize ? 1 : 2} columns={7} >
          {days.map((day, index) => {
            const dayRating = ratings.find(r => isSameDay(parseUTCToLocal(r.rating_date), day));
            const rating = dayRating?.rating;
            const note = dayRating?.note;

            return (
              // xs={1} with `columns={7}` makes each cell exactly 1/7 of the
              // row. The Button below sets aspectRatio so cells stay square
              // regardless of viewport — fixes the horizontal overflow that
              // 64px fixed widths caused on a 375px phone.
              <Grid item xs={1} key={index} sx={{ position: 'relative'}}>
                <Tooltip title={note ? (note.length > 200 ? `${note.substring(0, 200)} ...` : note) : ''} arrow>
                  <Button
                    onClick={() => isDayClickable(day) && handleDayClick(day)}
                    disabled={!isDayClickable(day)}
                    sx={{
                      minWidth: 0,
                      width: '100%',
                      aspectRatio: '1 / 1',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '4px',
                      // Rated cells keep their palette color; unrated/disabled use a
                      // theme-aware muted surface so the day number stays readable
                      // in both light and dark modes.
                      color: rating ? 'grey' : 'text.secondary',
                      backgroundColor: getRatingColor(rating),
                      '&.Mui-disabled': {
                        backgroundColor: 'action.hover',
                        color: 'text.disabled'
                      },
                      '&:hover': {
                        backgroundColor: rating ? `${getRatingColor(rating)}aa` : 'action.selected'
                      },
                    }}
                  >
                    {format(day, 'd')}
                    {getNoteIndicator(note)}
                  </Button>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>
      </Paper>
    </Box>
  );
};

export default MonthView;
