class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

function notFound(message = 'Resource not found') {
  return new HttpError(404, message);
}

function badRequest(message = 'Bad request', details = null) {
  return new HttpError(400, message, details);
}

module.exports = { HttpError, notFound, badRequest };
