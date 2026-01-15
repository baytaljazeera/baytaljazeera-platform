const { authStorage } = require('./storage');
const { isAuthenticated } = require('./replitAuth');

function registerAuthRoutes(app) {
  app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Failed to fetch user' });
    }
  });

  app.get('/api/auth/status', (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      res.json({
        authenticated: true,
        user: {
          id: req.user?.claims?.sub,
          email: req.user?.claims?.email,
          firstName: req.user?.claims?.first_name,
          lastName: req.user?.claims?.last_name,
          profileImage: req.user?.claims?.profile_image_url
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });
}

module.exports = { registerAuthRoutes };
