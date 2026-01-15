// backend/utils/queryHelpers.js - Centralized Query Helpers to reduce code duplication

const buildSearchClause = (fields, searchTerm, startParamIndex = 1) => {
  if (!searchTerm?.trim()) {
    return { clause: '', params: [], nextIndex: startParamIndex };
  }
  
  const conditions = fields.map(field => `${field} ILIKE $${startParamIndex}`).join(' OR ');
  return {
    clause: `(${conditions})`,
    params: [`%${searchTerm.trim()}%`],
    nextIndex: startParamIndex + 1
  };
};

const buildWhereClause = (conditions, baseWhere = '') => {
  const validConditions = conditions.filter(c => c.clause);
  if (validConditions.length === 0) {
    return baseWhere ? `WHERE ${baseWhere}` : '';
  }
  
  const combined = validConditions.map(c => c.clause).join(' AND ');
  return baseWhere 
    ? `WHERE ${baseWhere} AND ${combined}`
    : `WHERE ${combined}`;
};

const buildFilterClause = (field, value, paramIndex) => {
  if (value === undefined || value === null || value === '') {
    return { clause: '', params: [], nextIndex: paramIndex };
  }
  
  return {
    clause: `${field} = $${paramIndex}`,
    params: [value],
    nextIndex: paramIndex + 1
  };
};

const buildStatusFilter = (field, status, paramIndex) => {
  if (!status || status === 'all') {
    return { clause: '', params: [], nextIndex: paramIndex };
  }
  
  if (Array.isArray(status)) {
    const placeholders = status.map((_, i) => `$${paramIndex + i}`).join(', ');
    return {
      clause: `${field} IN (${placeholders})`,
      params: status,
      nextIndex: paramIndex + status.length
    };
  }
  
  return {
    clause: `${field} = $${paramIndex}`,
    params: [status],
    nextIndex: paramIndex + 1
  };
};

const buildDateRangeFilter = (field, from, to, paramIndex) => {
  const conditions = [];
  const params = [];
  let currentIndex = paramIndex;
  
  if (from) {
    conditions.push(`${field} >= $${currentIndex}`);
    params.push(from);
    currentIndex++;
  }
  
  if (to) {
    conditions.push(`${field} <= $${currentIndex}`);
    params.push(to);
    currentIndex++;
  }
  
  return {
    clause: conditions.length > 0 ? conditions.join(' AND ') : '',
    params,
    nextIndex: currentIndex
  };
};

const handleDatabaseError = (err, res, context = '') => {
  console.error(`Database error${context ? ` (${context})` : ''}:`, err);
  
  if (err.code === '23505') {
    const field = err.constraint?.includes('email') ? 'البريد الإلكتروني' :
                  err.constraint?.includes('phone') ? 'رقم الجوال' :
                  'البيانات';
    return res.status(409).json({ 
      error: `${field} مستخدم من قبل`, 
      errorEn: `${field} already exists` 
    });
  }
  
  if (err.code === '23503') {
    return res.status(400).json({ 
      error: 'مرجع غير صالح', 
      errorEn: 'Invalid reference' 
    });
  }
  
  if (err.code === '22P02') {
    return res.status(400).json({ 
      error: 'تنسيق البيانات غير صالح', 
      errorEn: 'Invalid data format' 
    });
  }
  
  return res.status(500).json({ 
    error: 'حدث خطأ في الخادم', 
    errorEn: 'Server error' 
  });
};

const paginatedQuery = async (db, { 
  baseQuery, 
  countQuery, 
  params, 
  pagination 
}) => {
  const { page, limit, offset } = pagination;
  const dataParams = [...params, limit, offset];
  
  const [dataResult, countResult] = await Promise.all([
    db.query(`${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, dataParams),
    db.query(countQuery, params)
  ]);
  
  const total = parseInt(countResult.rows[0]?.total || countResult.rows[0]?.count) || 0;
  
  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const SAFE_ORDER_FIELDS = {
  users: ['id', 'name', 'email', 'created_at', 'updated_at', 'role', 'status'],
  properties: ['id', 'title', 'price', 'created_at', 'updated_at', 'views', 'status', 'land_area', 'building_area'],
  plans: ['id', 'name_ar', 'price', 'created_at', 'max_listings'],
  reports: ['id', 'created_at', 'status', 'severity'],
  messages: ['id', 'created_at', 'read_at']
};

const validateOrderBy = (table, field, direction = 'DESC') => {
  const safeFields = SAFE_ORDER_FIELDS[table] || ['id', 'created_at'];
  const safeField = safeFields.includes(field?.toLowerCase()) ? field : 'created_at';
  const safeDirection = ['ASC', 'DESC'].includes(direction?.toUpperCase()) ? direction.toUpperCase() : 'DESC';
  
  return `${safeField} ${safeDirection}`;
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  buildSearchClause,
  buildWhereClause,
  buildFilterClause,
  buildStatusFilter,
  buildDateRangeFilter,
  handleDatabaseError,
  paginatedQuery,
  validateOrderBy,
  asyncHandler,
  SAFE_ORDER_FIELDS
};
