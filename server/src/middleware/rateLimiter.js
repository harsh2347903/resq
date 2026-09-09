/**
 * RESQ Defensive Sliding-Window Rate Limiter
 * Guards emergency endpoints against DDoS floods and spam while ensuring
 * zero-friction access for authenticated emergency personnel.
 */

const ipHits = new Map();

/**
 * Creates an in-memory sliding window rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.message - Error message when rate exceeded
 */
export function createRateLimiter({ windowMs = 60000, max = 60, message = 'Too many requests, please slow down.' } = {}) {
  // Clean up old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of ipHits.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        ipHits.delete(key);
      } else {
        ipHits.set(key, valid);
      }
    }
  }, windowMs * 2);

  return (req, res, next) => {
    // Whitelist authorized government officers and admins
    if (req.user?.role === 'government' || req.user?.role === 'admin') {
      return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();

    const timestamps = ipHits.get(key) || [];
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= max) {
      const retryAfterSeconds = Math.ceil((recent[0] + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        error: message,
        retryAfterSeconds
      });
    }

    recent.push(now);
    ipHits.set(key, recent);
    next();
  };
}
