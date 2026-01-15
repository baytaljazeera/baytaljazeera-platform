const { setupAuth, isAuthenticated, getSession } = require('./replitAuth');
const { authStorage } = require('./storage');
const { registerAuthRoutes } = require('./routes');

module.exports = {
  setupAuth,
  isAuthenticated,
  getSession,
  authStorage,
  registerAuthRoutes
};
