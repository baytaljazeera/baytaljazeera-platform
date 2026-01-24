// Dynamic imports for ESM compatibility (openid-client v6+ is ESM-only)
let client, Strategy;

async function loadDependencies() {
  try {
    client = await import('openid-client');
    const passportModule = await import('openid-client/passport');
    Strategy = passportModule.Strategy;
    return true;
  } catch (err) {
    console.log('⚠️ openid-client not available (ESM module issue):', err.message);
    return false;
  }
}

const passport = require('passport');
const session = require('express-session');
const memoize = require('memoizee');
const connectPg = require('connect-pg-simple');
const { authStorage } = require('./storage');

let oidcConfigCache = null;

async function getOidcConfig() {
  if (oidcConfigCache) return oidcConfigCache;
  
  oidcConfigCache = await client.discovery(
    new URL(process.env.ISSUER_URL || 'https://replit.com/oidc'),
    process.env.REPL_ID
  );
  return oidcConfigCache;
}

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
  // Load ESM dependencies first
  const loaded = await loadDependencies();
  if (!loaded) {
    console.log('⚠️ Replit Auth skipped - running outside Replit or ESM issue');
    return;
  }
  
  // Check if running in Replit environment
  if (!process.env.REPL_ID) {
    console.log('⚠️ Replit Auth skipped - not running in Replit environment');
    return;
  }
  
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

  const strategyProviders = {
    google: 'Google',
    apple: 'Apple',
    github: 'GitHub',
    x: 'X',
    email: 'Email/Password',
  };

  for (const provider of Object.keys(strategyProviders)) {
    if (!registeredStrategies.has(provider)) {
      const callbackUrl = `/__replit/auth/${provider}/callback`;
      passport.use(
        provider,
        new Strategy({ config, scope: 'openid email profile', callbackURL: callbackUrl }, verify)
      );
      registeredStrategies.add(provider);
    }
  }

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
}

function registerAuthRoutes(app) {
  // Check if running in Replit environment
  if (!process.env.REPL_ID) {
    console.log('⚠️ Replit Auth routes skipped - not running in Replit environment');
    return;
  }
  
  const providers = ['google', 'apple', 'github', 'x', 'email'];

  for (const provider of providers) {
    app.get(`/__replit/auth/${provider}`, (req, res, next) => {
      return passport.authenticate(provider)(req, res, next);
    });

    app.get(`/__replit/auth/${provider}/callback`, (req, res, next) => {
      return passport.authenticate(provider, {
        successRedirect: '/',
        failureRedirect: '/login',
      })(req, res, next);
    });
  }

  app.get('/api/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
      return res.json(req.user);
    }
    res.status(401).json({ message: 'Unauthorized' });
  });

  app.post('/api/logout', (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: 'Logout failed' });
      res.json({ message: 'Logged out' });
    });
  });
}

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
}

module.exports = { setupAuth, registerAuthRoutes, isAuthenticated };
