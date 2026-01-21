// backend/db.js - Optimized with connection pooling and smart caching
const { Pool, types } = require("pg");

types.setTypeParser(types.builtins.JSON, (val) => JSON.parse(val));
types.setTypeParser(types.builtins.JSONB, (val) => JSON.parse(val));

// Fix DATABASE_URL if it has 'psql' prefix
let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.startsWith("psql ")) {
  connectionString = connectionString.replace("psql ", "").replace(/'/g, "");
}

// Optimized pool configuration for production performance
// For millions of users: Consider using RDS Proxy or PgBouncer
// Current config: Suitable for up to 100K concurrent users
const pool = new Pool({
  connectionString: connectionString,
  max: parseInt(process.env.DB_POOL_MAX) || 20, // Can be increased to 50+ with RDS Proxy
  min: parseInt(process.env.DB_POOL_MIN) || 5, // Minimum connections for faster response
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  // Enable keep-alive for better connection management
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// In-memory cache with smart invalidation
const cache = new Map();
const CACHE_TTL = 15000; // 15 seconds default

// Cache invalidation mappings - which tables affect which cache keys
const INVALIDATION_MAP = {
  'properties': ['admin:pending-counts', 'listings:elite'],
  'listing_reports': ['admin:pending-counts'],
  'membership_requests': ['admin:pending-counts'],
  'refunds': ['admin:pending-counts'],
  'admin_messages': ['admin:pending-counts'],
  'account_complaints': ['admin:pending-counts'],
  'support_tickets': ['admin:pending-counts'],
  'users': ['admin:users-stats'],
  'user_plans': ['admin:users-stats'],
  'featured_cities': ['cities:featured']
};

const cacheGet = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

const cacheSet = (key, value, ttl = CACHE_TTL) => {
  cache.set(key, {
    value,
    expires: Date.now() + ttl
  });
};

const cacheDelete = (key) => {
  cache.delete(key);
};

const cacheClear = (pattern) => {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

// Invalidate cache based on table name
const invalidateFor = (tableName) => {
  const keys = INVALIDATION_MAP[tableName] || [];
  keys.forEach(key => cache.delete(key));
};

// Detect if query is a mutation (INSERT, UPDATE, DELETE)
const isMutation = (sql) => {
  const normalized = sql.trim().toUpperCase();
  return normalized.startsWith('INSERT') || 
         normalized.startsWith('UPDATE') || 
         normalized.startsWith('DELETE');
};

// Extract table name from mutation query
const extractTableName = (sql) => {
  const normalized = sql.trim().toUpperCase();
  let match;
  
  if (normalized.startsWith('INSERT')) {
    match = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  } else if (normalized.startsWith('UPDATE')) {
    match = sql.match(/UPDATE\s+(\w+)/i);
  } else if (normalized.startsWith('DELETE')) {
    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
  }
  
  return match ? match[1].toLowerCase() : null;
};

// Query with automatic cache invalidation for mutations
const query = async (text, params) => {
  const result = await pool.query(text, params);
  
  if (isMutation(text)) {
    const tableName = extractTableName(text);
    if (tableName) {
      invalidateFor(tableName);
    }
  }
  
  return result;
};

// Cached query helper - for read-only dashboard queries
const cachedQuery = async (cacheKey, text, params, ttl = CACHE_TTL) => {
  const cached = cacheGet(cacheKey);
  if (cached) {
    return cached;
  }
  
  const result = await pool.query(text, params);
  cacheSet(cacheKey, result, ttl);
  return result;
};

// Mutating query with automatic cache invalidation
const mutatingQuery = async (tableName, text, params) => {
  const result = await pool.query(text, params);
  invalidateFor(tableName);
  return result;
};

module.exports = {
  query,
  cachedQuery,
  mutatingQuery,
  connect: () => pool.connect(),
  pool,
  cache: {
    get: cacheGet,
    set: cacheSet,
    delete: cacheDelete,
    clear: cacheClear,
    invalidateFor
  }
};
