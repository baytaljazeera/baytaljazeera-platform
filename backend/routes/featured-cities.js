const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads/cities'));
  },
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'), false);
    }
  }
});

router.get('/', asyncHandler(async (req, res) => {
  const { active_only } = req.query;
  
  let query = 'SELECT * FROM featured_cities';
  const params = [];
  
  if (active_only === 'true') {
    query += ' WHERE is_active = true';
  }
  
  query += ' ORDER BY sort_order ASC, name_ar ASC';
  
  const result = await db.query(query, params);
  res.json({ cities: result.rows });
}));

router.get('/active', asyncHandler(async (req, res) => {
  const CACHE_KEY = 'cities:featured';
  const CACHE_TTL = 60000; // 60 seconds
  
  const result = await db.cachedQuery(
    CACHE_KEY,
    'SELECT * FROM featured_cities WHERE is_active = true ORDER BY sort_order ASC, name_ar ASC',
    [],
    CACHE_TTL
  );
  res.json({ cities: result.rows });
}));

router.put('/reorder', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { cities } = req.body;
  
  if (!Array.isArray(cities)) {
    return res.status(400).json({ error: 'البيانات غير صحيحة' });
  }
  
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    for (const city of cities) {
      await client.query(
        'UPDATE featured_cities SET sort_order = $1, updated_at = NOW() WHERE id = $2',
        [city.sort_order, city.id]
      );
    }
    
    await client.query('COMMIT');
    
    // Invalidate cache after successful update
    db.cache.invalidateFor('featured_cities');
    
    res.json({ message: 'تم تحديث الترتيب بنجاح' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM featured_cities WHERE id = $1', [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'المدينة غير موجودة' });
  }
  
  res.json({ city: result.rows[0] });
}));

router.post('/', authMiddleware, adminMiddleware, upload.single('image'), asyncHandler(async (req, res) => {
  const { name_ar, name_en, country_code, country_name_ar, is_capital, sort_order, is_active } = req.body;
  
  if (!name_ar || !country_code) {
    return res.status(400).json({ error: 'اسم المدينة ورمز الدولة مطلوبان' });
  }
  
  let image_url = null;
  if (req.file) {
    image_url = `/uploads/cities/${req.file.filename}`;
  }
  
  const result = await db.mutatingQuery(
    'featured_cities',
    `INSERT INTO featured_cities (name_ar, name_en, country_code, country_name_ar, image_url, is_capital, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name_ar, name_en || null, country_code, country_name_ar || null, image_url, is_capital === 'true', parseInt(sort_order) || 0, is_active !== 'false']
  );
  
  res.status(201).json({ city: result.rows[0], message: 'تم إضافة المدينة بنجاح' });
}));

router.put('/:id', authMiddleware, adminMiddleware, upload.single('image'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name_ar, name_en, country_code, country_name_ar, is_capital, sort_order, is_active } = req.body;
  
  const existing = await pool.query('SELECT * FROM featured_cities WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'المدينة غير موجودة' });
  }
  
  let image_url = existing.rows[0].image_url;
  if (req.file) {
    image_url = `/uploads/cities/${req.file.filename}`;
  }
  
  const result = await db.mutatingQuery(
    'featured_cities',
    `UPDATE featured_cities 
     SET name_ar = $1, name_en = $2, country_code = $3, country_name_ar = $4, image_url = $5, 
         is_capital = $6, sort_order = $7, is_active = $8, updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [name_ar, name_en || null, country_code, country_name_ar || null, image_url, 
     is_capital === 'true', parseInt(sort_order) || 0, is_active !== 'false', id]
  );
  
  res.json({ city: result.rows[0], message: 'تم تحديث المدينة بنجاح' });
}));

router.delete('/:id', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.mutatingQuery(
    'featured_cities',
    'DELETE FROM featured_cities WHERE id = $1 RETURNING *',
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'المدينة غير موجودة' });
  }
  
  res.json({ message: 'تم حذف المدينة بنجاح' });
}));

router.patch('/:id/toggle', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.mutatingQuery(
    'featured_cities',
    `UPDATE featured_cities SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'المدينة غير موجودة' });
  }
  
  res.json({ city: result.rows[0], message: result.rows[0].is_active ? 'تم تفعيل المدينة' : 'تم إلغاء تفعيل المدينة' });
}));

module.exports = router;
