const mysql = require('mysql2');
const session = require('express-session');
const mysqlSession = require('express-mysql-session')(session);

const options = {
    host: 'localhost',
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'RateMyDay'
};

const pool = mysql.createPool(options);
const promisePool = pool.promise();

// Create a session store using the MySQL connection
const sessionStore = new mysqlSession(options);

module.exports = { db: promisePool, sessionStore };
