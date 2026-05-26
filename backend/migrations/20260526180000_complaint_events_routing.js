/**
 * Explicit routing on internal events so "توجيه داخلي" stops being a
 * mystery destination. Adds:
 *   target_kind        — 'note' | 'department' | 'user' | 'assignment'
 *   target_user_id     — recipient when kind is 'user' or 'assignment'
 *   target_role        — recipient role when kind is 'department'
 *   target_name_snapshot/email_snapshot — recipient identity at send time
 *   due_at             — assignment deadline (null for non-assignments)
 *   assignment_priority — low / medium / high / urgent (null otherwise)
 *   assignment_status  — pending / completed / cancelled (null otherwise)
 *   read_at            — set when the recipient first opens the directive
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (!exists) return;
  const cols = await Promise.all([
    knex.schema.hasColumn("complaint_events", "target_kind"),
    knex.schema.hasColumn("complaint_events", "target_user_id"),
    knex.schema.hasColumn("complaint_events", "target_role"),
    knex.schema.hasColumn("complaint_events", "target_name_snapshot"),
    knex.schema.hasColumn("complaint_events", "target_email_snapshot"),
    knex.schema.hasColumn("complaint_events", "due_at"),
    knex.schema.hasColumn("complaint_events", "assignment_priority"),
    knex.schema.hasColumn("complaint_events", "assignment_status"),
    knex.schema.hasColumn("complaint_events", "read_at"),
  ]);
  await knex.schema.alterTable("complaint_events", (table) => {
    if (!cols[0]) table.string("target_kind", 16).nullable();
    if (!cols[1]) table.bigInteger("target_user_id").nullable();
    if (!cols[2]) table.string("target_role", 64).nullable();
    if (!cols[3]) table.string("target_name_snapshot", 200).nullable();
    if (!cols[4]) table.string("target_email_snapshot", 200).nullable();
    if (!cols[5]) table.timestamp("due_at", { useTz: true }).nullable();
    if (!cols[6]) table.string("assignment_priority", 16).nullable();
    if (!cols[7]) table.string("assignment_status", 16).nullable();
    if (!cols[8]) table.timestamp("read_at", { useTz: true }).nullable();
  });
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (!exists) return;
  const cols = [
    "target_kind", "target_user_id", "target_role",
    "target_name_snapshot", "target_email_snapshot",
    "due_at", "assignment_priority", "assignment_status", "read_at",
  ];
  for (const c of cols) {
    const has = await knex.schema.hasColumn("complaint_events", c);
    if (has) await knex.schema.alterTable("complaint_events", (t) => t.dropColumn(c));
  }
};
