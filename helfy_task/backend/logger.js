const log4js = require('log4js');

// Configure log4js to log to stdout with a single-line JSON format for easy parsing in container logs.
log4js.configure({
  appenders: {
    out: { type: 'stdout', layout: { type: 'messagePassThrough' } },
  },
  categories: {
    default: { appenders: ['out'], level: process.env.LOG_LEVEL || 'info' },
  },
});

const logger = log4js.getLogger();

// Create a single-line JSON record so container logs stay machine-parseable. not best pracite to log sensitive information like passwords, but for this example,
//  we will log the username/email and IP address.
function logEvent(fields) {
  logger.info(JSON.stringify({ timestamp: new Date().toISOString(), ...fields }));
}

module.exports = { logger, logEvent };
