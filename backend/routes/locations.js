const express = require('express');
const router = express.Router();
const db = require('../db');
const { asyncHandler } = require('../middleware/asyncHandler');

router.get("/countries", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT id, code, name_ar, name_en, flag_emoji, region, display_order,
           latitude, longitude, default_zoom
    FROM countries
    WHERE is_active = true
    ORDER BY display_order ASC
  `);
  res.json({ countries: result.rows });
}));

router.get("/cities", asyncHandler(async (req, res) => {
  const { country_id, popular_only } = req.query;
  
  let query = `
    SELECT c.id, c.name_ar, c.name_en, c.region_ar, c.region_en, c.is_popular, c.display_order,
           c.latitude, c.longitude,
           co.code as country_code, co.name_ar as country_name_ar, co.name_en as country_name_en, co.flag_emoji
    FROM cities c
    JOIN countries co ON c.country_id = co.id
    WHERE c.is_active = true
  `;
  const params = [];
  
  if (country_id) {
    params.push(country_id);
    query += ` AND c.country_id = $${params.length}`;
  }
  
  if (popular_only === 'true') {
    query += ` AND c.is_popular = true`;
  }
  
  query += ` ORDER BY co.display_order ASC, c.display_order ASC`;
  
  const result = await db.query(query, params);
  res.json({ cities: result.rows });
}));

router.get("/cities/search", asyncHandler(async (req, res) => {
  const { q, country_id, limit = 10 } = req.query;
  
  if (!q || q.length < 2) {
    return res.json({ cities: [] });
  }
  
  const searchTerm = `%${q}%`;
  let query = `
    SELECT c.id, c.name_ar, c.name_en, c.region_ar, c.region_en, c.is_popular,
           c.latitude, c.longitude,
           co.code as country_code, co.name_ar as country_name_ar, co.name_en as country_name_en, co.flag_emoji
    FROM cities c
    JOIN countries co ON c.country_id = co.id
    WHERE c.is_active = true
      AND (c.name_ar ILIKE $1 OR c.name_en ILIKE $1 OR c.region_ar ILIKE $1 OR c.region_en ILIKE $1)
  `;
  const params = [searchTerm];
  
  if (country_id) {
    params.push(country_id);
    query += ` AND c.country_id = $${params.length}`;
  }
  
  params.push(parseInt(limit) || 10);
  query += ` ORDER BY c.is_popular DESC, c.display_order ASC LIMIT $${params.length}`;
  
  const result = await db.query(query, params);
  res.json({ cities: result.rows });
}));

router.get("/cities/:countryCode", asyncHandler(async (req, res) => {
  const { countryCode } = req.params;
  const { popular_only } = req.query;
  
  let query = `
    SELECT c.id, c.name_ar, c.name_en, c.region_ar, c.region_en, c.is_popular, c.display_order,
           c.latitude, c.longitude
    FROM cities c
    JOIN countries co ON c.country_id = co.id
    WHERE c.is_active = true AND UPPER(co.code) = UPPER($1)
  `;
  const params = [countryCode];
  
  if (popular_only === 'true') {
    query += ` AND c.is_popular = true`;
  }
  
  query += ` ORDER BY c.display_order ASC`;
  
  const result = await db.query(query, params);
  res.json({ cities: result.rows });
}));

module.exports = router;
