const client = require('openid-client');
const { Strategy } = require('openid-client/passport');
const passport = require('passport');
const session = require('express-session');
const memoize = require('memoizee');
const connectPg = require('connect-pg-simple');
const { authStorage } = require('./storage');

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL || 'https://replit.com/oidc'),
      process.env.REPL_ID
    );
  },
  { maxAge: 3600 * 1000 }
);

function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const PgStore = connectPg(session);
  
  // Fix DATABASE_URL if it has 'psql' prefix (same fix as backend/db.js)
  let connectionString = process.env.DATABASE_URL;
  if (connectionString && connectionString.startsWith("psql ")) {
    connectionString = connectionString.replace("psql ", "").replace(/'/g, "");
  }
  
  const sessionStore = new PgStore({
    conString: connectionString,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: 'replit_sessions',
  });
  
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
      sameSite: 'lax',
    },
  });
}

function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims) {
  await authStorage.upsertUser({
    id: claims['sub'],
    email: claims['email'],
    firstName: claims['first_name'],
    lastName: claims['last_name'],
    profileImageUrl: claims['profile_image_url'],
  });
}

async function setupAuth(app) {
  app.set('trust proxy', 1);
  
  // Standard session middleware - hostname fix is done earlier in index.js
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify = async (tokens, verified) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set();

  const getValidDomain = (hostname) => {
    if (!hostname || hostname === 'base' || hostname === 'localhost' || hostname.length < 3) {
      return process.env.REPLIT_DEV_DOMAIN || 'replit.dev';
    }
    return hostname;
  };

  const ensureStrategy = (domain) => {
    const validDomain = getValidDomain(domain);
    const strategyName = `replitauth:${validDomain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: 'openid email profile offline_access',
          callbackURL: `https://${validDomain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
    return validDomain;
  };

  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user, cb) => cb(null, user));

  app.get('/api/login', (req, res, next) => {
    const validDomain = ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${validDomain}`, {
      prompt: 'login consent',
      scope: ['openid', 'email', 'profile', 'offline_access'],
    })(req, res, next);
  });

  app.get('/api/callback', (req, res, next) => {
    const validDomain = ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${validDomain}`, {
      successReturnToOrRedirect: '/',
      failureRedirect: '/api/login',
    })(req, res, next);
  });

  app.get('/api/logout', (req, res) => {
    const validDomain = getValidDomain(req.hostname);
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID,
          post_logout_redirect_uri: `${req.protocol}://${validDomain}`,
        }).href
      );
    });
  });
}

const isAuthenticated = async (req, res, next) => {
  const user = req.user;

  if (!req.isAuthenticated || !req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

module.exports = { setupAuth, isAuthenticated, getSession };
