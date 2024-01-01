const dev = {
    ENDPOINT_PREFIX: 'http://localhost:3001',
    BASENAME: '/rate-my-day'
  };
  
  const prod = {
    ENDPOINT_PREFIX: 'https://apps.indranilsen.com/rate-my-day',
    BASENAME: '/rate-my-day'
  };
  
  const config = process.env.NODE_ENV === 'development' ? dev : prod;
  
  export default config;