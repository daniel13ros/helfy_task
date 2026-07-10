const crypto = require('crypto');
const express = require('express');
const bcrypy = require('bcryptjs');

const pool = require('./db');
const { logger, logEvent } = require('./logger');

const app = express();
app.use(express.json());

const 