const jwt = require('jsonwebtoken');
const session = require('../services/session');

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }

  try {
    const id = decoded.userId ?? decoded.id;
    const current = await session.versionOf(id);
    // no such user (deleted), or the password was changed after this token was made
    if (current === null || Number(decoded.tv ?? 0) !== current) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    req.user = { ...decoded, id }; // normalize id
    next();
  } catch (err) {
    console.error('AUTH CHECK ERROR:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};