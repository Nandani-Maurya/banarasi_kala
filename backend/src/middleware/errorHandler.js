const { config } = require('../config/env');

const errorHandler = (error, req, res, next) => {
  const status = Number(error.status || error.statusCode) || 500;
  const message = error.message || 'Internal server error';

  console.error(`[ERR ${req?.reqId || 'n/a'}] ${req?.method || ''} ${req?.originalUrl || ''}`, {
    status,
    message,
    stack: error.stack,
    detail: error?.response?.data || null,
  });

  return res.status(status).json({
    message: config.isProduction && status >= 500 ? 'Internal server error' : message,
    code: error.code || null,
    reqId: req?.reqId || null,
  });
};

module.exports = errorHandler;
