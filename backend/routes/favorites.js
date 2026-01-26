// backend/routes/favorites.js - Favorites Routes
const express = require("express");
const db = require("../db");
const { authMiddlewareWithEmailCheck } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.post("/toggle", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { listingId } = req.body;

  if (!listingId) {
    return res.status(400).json({ error: "معرف الإعلان مطلوب" });
  }

  const existing = await db.query(
    `SELECT id FROM favorites WHERE user_id = $1 AND listing_id = $2`,
    [userId, listingId]
  );

  if (existing.rows[0]) {
    await db.query("DELETE FROM favorites WHERE id = $1", [existing.rows[0].id]);
    return res.json({ favorited: false, message: "تمت الإزالة من المفضلة" });
  }

  await db.query(
    `INSERT INTO favorites (user_id, listing_id) VALUES ($1, $2)`,
    [userId, listingId]
  );
  res.json({ favorited: true, message: "تمت الإضافة للمفضلة" });
}));

router.get("/", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const result = await db.query(
    `SELECT p.*, f.created_at as favorited_at
     FROM favorites f
     JOIN properties p ON p.id = f.listing_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  res.json({ favorites: result.rows });
}));

router.get("/ids", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const result = await db.query(
    `SELECT listing_id FROM favorites WHERE user_id = $1`,
    [userId]
  );
  res.json({ ids: result.rows.map(r => r.listing_id) });
}));

router.delete("/:listingId", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { listingId } = req.params;
  
  await db.query(
    `DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2`,
    [userId, listingId]
  );
  res.json({ ok: true, message: "تمت الإزالة من المفضلة" });
}));

module.exports = router;
