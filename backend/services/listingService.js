const db = require('../db');

const deleteListingCascade = async (listingId) => {
  await db.query("DELETE FROM favorites WHERE listing_id = $1", [listingId]);
  await db.query("DELETE FROM listing_reports WHERE listing_id = $1", [listingId]);
  await db.query("DELETE FROM notifications WHERE listing_id = $1", [listingId]);
  await db.query("DELETE FROM listing_messages WHERE listing_id = $1", [listingId]);
  
  try {
    await db.query("DELETE FROM elite_slot_reservations WHERE property_id = $1", [listingId]);
  } catch (e) {}
  
  const listing = await getListingById(listingId);
  if (listing?.bucket_id) {
    await db.query("UPDATE quota_buckets SET used_count = used_count - 1 WHERE id = $1", [listing.bucket_id]);
  }
  
  await db.query("DELETE FROM properties WHERE id = $1", [listingId]);
};

const getListingById = async (listingId) => {
  const result = await db.query("SELECT * FROM properties WHERE id = $1", [listingId]);
  return result.rows[0] || null;
};

const updateListingStatus = async (listingId, status, reviewedBy, adminNote = null) => {
  const result = await db.query(
    `UPDATE properties 
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), admin_note = $3, updated_at = NOW()
     WHERE id = $4 
     RETURNING *`,
    [status, reviewedBy, adminNote, listingId]
  );
  return result.rows[0] || null;
};

const createNotification = async (userId, title, body, type, listingId = null) => {
  await db.query(
    `INSERT INTO notifications (user_id, title, body, type, listing_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [userId, title, body, type, listingId]
  );
};

module.exports = {
  deleteListingCascade,
  getListingById,
  updateListingStatus,
  createNotification
};
