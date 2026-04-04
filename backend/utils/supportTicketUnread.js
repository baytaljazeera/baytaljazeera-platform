/**
 * Count admin/staff replies on a customer's support tickets that the customer
 * has not yet seen (user_last_read_at on support_tickets).
 */
async function getCustomerUnreadAdminReplyCount(db, userId) {
  try {
    const result = await db.query(
      `
      SELECT COUNT(*)::int AS count
      FROM support_ticket_replies r
      INNER JOIN support_tickets st ON st.id = r.ticket_id
      LEFT JOIN users u ON r.sender_id = u.id
      WHERE st.user_id = $1
        AND r.sender_id IS DISTINCT FROM st.user_id
        AND (
          r.sender_type = 'admin'
          OR (u.role IS NOT NULL AND u.role <> 'user')
        )
        AND (st.user_last_read_at IS NULL OR r.created_at > st.user_last_read_at)
    `,
      [userId]
    );
    const n = result.rows[0]?.count;
    return Number(n) || 0;
  } catch (err) {
    console.warn("[supportTicketUnread] getCustomerUnreadAdminReplyCount:", err.message);
    return 0;
  }
}

module.exports = { getCustomerUnreadAdminReplyCount };
