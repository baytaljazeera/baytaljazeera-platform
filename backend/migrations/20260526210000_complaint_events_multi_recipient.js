/**
 * Multi-recipient routing on directives/assignments. Stores the full
 * recipient list as a JSONB column so a single event can fan out to:
 *   - multiple specific users
 *   - one or more whole departments (roles)
 *   - the entire active staff ("everyone")
 *
 * Shape:
 *   {
 *     users: [{ id, name, email, role }, ...],   // explicit picks
 *     roles: [{ role, member_count }, ...],      // whole-department picks
 *     everyone: false                            // OR true → notify all staff
 *   }
 *
 * The old single-target columns (target_user_id, target_role) stay around
 * for backwards compatibility with the events written before this migration
 * — readers should prefer recipients JSONB and fall back to single-target
 * fields if it's null.
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (!exists) return;
  const has = await knex.schema.hasColumn("complaint_events", "recipients");
  if (!has) {
    await knex.schema.alterTable("complaint_events", (table) => {
      table.jsonb("recipients").nullable();
    });
  }
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (!exists) return;
  const has = await knex.schema.hasColumn("complaint_events", "recipients");
  if (has) {
    await knex.schema.alterTable("complaint_events", (table) => {
      table.dropColumn("recipients");
    });
  }
};
