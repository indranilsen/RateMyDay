# RateMyDay

RateMyDay is an intuitive and user-friendly web application designed to help users track and reflect on their daily experiences. It provides a simple yet powerful way to rate each day and add notes for personal reference.

## Features

- **Daily Ratings**: Users can rate their day on a scale from 1 to 5, with 1 being the lowest and 5 being the highest.
- **Monthly Views**: The application displays a grid of days for each month, where users can see at a glance the ratings they've given for each day.
- **Yearly Overview**: Users can view their entire year at once, with each day color-coded according to the rating it received. This overview provides a unique perspective on how the year has been, highlighting patterns and trends in wellbeing and activities over time.
- **Notes**: For each day, users can add a note to remind them of events or feelings associated with that date.
- **Responsive Design**: RateMyDay is fully responsive and adapts to various devices, ensuring a seamless experience on desktops, tablets, and mobile phones.
- **User Authentication**: Secure login and registration functionality to keep personal data private.
- **Logout and Settings**: Easy access to logout and account settings for convenience and security.

## Technologies Used

- **Frontend**: React.js with Material UI for a modern interface and user experience. This was my first time learning React and using it for a frontend solution.
- **Backend**: Node.js and Express for a the server-side solution.
- **Database**: MySQL to store user data and ratings securely.
- **Authentication**: Session-based authentication to manage user sessions.
- **Deployment**: Configured for deployment to cloud hosting services.

## Installation

To set up the RateMyDay app on your local machine:

1. Clone the repository: 
`git clone https://github.com/indranilsen/RateMyDay.git`

2. Navigate to the project directory: 
`cd RateMyDay`

3. Install dependencies: 
`npm install`

4. Start the backend server: 
`npm start`
The server will start on `http://localhost:3001`.

### Frontend Setup

1. Navigate to the frontend directory from the project root:
`cd rmd-ui`

2. Install frontend dependencies:
`npm install`

3. Start the frontend application:
`npm start`

This will launch the front-end of RateMyDay on `http://localhost:3000`.

## Usage

After logging in, users can navigate between the different views (Day, Month, Year) using the navigation tabs. To rate a day, simply click on the day's cell in the monthly view and select the desired rating. Notes can be added in the detailed day view.

The yearly view is particularly helpful in providing a bird's-eye view of the user's year. It's a powerful tool for self-reflection and helps to quickly identify periods of high and lows, enabling users to gain insights into their overall mood and wellbeing throughout the year.

For the backend services, make sure that the server is running on `http://localhost:3001` as the frontend expects to communicate with this address.

## Environment Configuration

Before running the application, the environment variables will need to be set up. Create `.env.dev` for development and `.env.prod` for production settings, using `.env` as a template for expected variables.

## Contribution

Contributions to RateMyDay are welcome. Please fork the repository and submit pull requests with your proposed changes.

---

RateMyDay — Reflect on your day, every day.

