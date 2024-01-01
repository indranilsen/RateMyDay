const express = require('express');
const router = express.Router();
const { db } = require('../db');

const { format } = require('date-fns');

// Utility function to format the rating_date
const formatRatingDate = (ratings) => {
    return ratings.map(rating => ({
      ...rating,
      rating_date: rating.rating_date.toISOString().split('T')[0] // Format to 'YYYY-MM-DD'
    }));
  };

// Submit rating endpoint
router.post('/submit-rating', async (req, res) => {
    const userId = req.session.userId;
    const { ratingDate, rating, note } = req.body;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!ratingDate || rating === undefined || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Invalid rating data' });
    }
  
    try {
      // Check if a rating already exists for the given date
      const [existing] = await db.query('SELECT id FROM ratings WHERE user_id = ? AND rating_date = ?', [userId, ratingDate]);
      
      if (existing.length > 0) {
        // Update the existing rating
        await db.query('UPDATE ratings SET rating = ?, note = ? WHERE id = ?', [rating, note, existing[0].id]);
        res.json({ message: 'Rating updated successfully' });
      } else {
        // Insert a new rating
        await db.query('INSERT INTO ratings (user_id, rating_date, rating, note) VALUES (?, ?, ?, ?)', [userId, ratingDate, rating, note]);
        res.json({ message: 'Rating submitted successfully' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error submitting rating' });
    }
  });


// Endpoint to retrieve rating for a specific date
router.get('/submit-rating', async (req, res) => {
    const userId = req.session.userId;
    const { ratingDate } = req.query;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!ratingDate) {
      return res.status(400).json({ message: 'No date provided' });
    }
  
    try {
      // Retrieve the rating for the given date and user
      const [ratings] = await db.query('SELECT rating, note FROM ratings WHERE user_id = ? AND rating_date = ?', [userId, ratingDate]);
  
      if (ratings.length > 0) {
        res.json(ratings[0]);
      } else {
        res.json({});
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving rating' });
    }
});
  

// Get month data endpoint
router.get('/month-data', async (req, res) => {
    const userId = req.session.userId;
    const { year, month } = req.query;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }
  
    try {
      // Calculate the start and end dates of the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
  
      // Retrieve all ratings for the given month and user
      const [ratings] = await db.query(
        'SELECT rating_date, rating, note FROM ratings WHERE user_id = ? AND rating_date BETWEEN ? AND ?',
        [userId, startDate, endDate]
      );
  
      res.json(formatRatingDate(ratings));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving monthly data' });
    }
  });

// Year data endpoint
router.get('/year-data', async (req, res) => {
    const userId = req.session.userId;
    const { year } = req.query;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
    if (!year) {
      return res.status(400).json({ message: 'Year is required' });
    }
  
    try {
      // Calculate the start and end dates of the year
      const startDate = `${year}-01-01`; // January 1st of the year
      const endDate = `${year}-12-31`; // December 31st of the year
  
      // Retrieve all ratings for the given year and user
      const [ratings] = await db.query(
        'SELECT rating_date, rating FROM ratings WHERE user_id = ? AND rating_date BETWEEN ? AND ? ORDER BY rating_date ASC',
        [userId, startDate, endDate]
      );
  
      res.json(formatRatingDate(ratings));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving year data' });
    }
  });

// Available years endpoint
router.get('/available-years', async (req, res) => {
    const userId = req.session.userId;
  
    // Basic validation
    if (!userId) {
      return res.status(403).json({ message: 'Not logged in' });
    }
  
    try {
      // Retrieve all distinct years for which the given user has rating data
      const [yearsData] = await db.query(
        'SELECT DISTINCT YEAR(rating_date) AS year FROM ratings WHERE user_id = ? ORDER BY year DESC',
        [userId]
      );
  
      // Extract just the years from the query result
      const years = yearsData.map(item => item.year);
  
      res.json(years);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving available years' });
    }
  });

// Export the router
module.exports = router;
