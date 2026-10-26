const jwt = require('jsonwebtoken');

function createAuthMiddlewares(redisStore, grpcClients, { jwtSecret }) {
  const secret = jwtSecret || process.env.JWT_SECRET || 'ecommerce-mvp-super-secret-jwt-key-2026';

  const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization Bearer token'
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Bearer token cannot be empty'
      });
    }

    try {
      // 1. Check Redis Token Blacklist (logged out / revoked tokens)
      const blacklisted = await redisStore.get(`token:bl:${token}`);
      if (blacklisted) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has been revoked'
        });
      }

      // 2. Check Redis Token Cache for fast validation
      const cachedClaims = await redisStore.get(`token:valid:${token}`);
      if (cachedClaims) {
        req.user = { ...JSON.parse(cachedClaims), token };
        return next();
      }

      // 3. Verify JWT locally & cross-verify if needed
      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (_jwtErr) {
        // Fallback to Auth Service VerifyToken RPC
        const verifyRes = await grpcClients.auth.VerifyToken({ token });
        if (!verifyRes || !verifyRes.valid) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: (verifyRes && verifyRes.error) || 'Invalid or expired JWT token'
          });
        }
        decoded = {
          uid: verifyRes.uid,
          sub: verifyRes.uid,
          username: verifyRes.username,
          role: verifyRes.role
        };
      }

      const userClaims = {
        uid: Number(decoded.uid || decoded.sub),
        username: decoded.username || '',
        role: decoded.role || 'customer',
        exp: decoded.exp || null
      };

      const nowSec = Math.floor(Date.now() / 1000);
      const ttl = userClaims.exp ? Math.max(1, Math.min(300, userClaims.exp - nowSec)) : 300;
      await redisStore.setEx(`token:valid:${token}`, ttl, JSON.stringify(userClaims));

      req.user = { ...userClaims, token };
      return next();
    } catch (err) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token verification failed'
      });
    }
  };

  const authorizeRoles = (...allowedRoles) => {
    const normalized = allowedRoles.map((r) => r.toLowerCase());
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      }
      const userRole = String(req.user.role || '').toLowerCase();
      if (!normalized.includes(userRole)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions: role '${userRole}' is not allowed. Required: ${normalized.join(' or ')}`
        });
      }
      return next();
    };
  };

  return { authenticate, authorizeRoles };
}

module.exports = { createAuthMiddlewares };

