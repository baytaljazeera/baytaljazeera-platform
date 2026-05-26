/**
 * Per-complaint audit log. Every meaningful action (created, status_changed,
 * note_added, transferred, reopened, closed) writes a row here with a
 * SNAPSHOT of the actor — so when the team grows to 5 support + 3 finance
 * agents, you can still see "who actually moved this ticket and when, even
 * after they rotated to a different role / left the company".
 *
 * Fields:
 *   complaint_id           — FK
 *   event_type             — 'created' | 'status_changed' | 'note_added' |
 *                            'transferred' | 'reopened' | ...
 *   actor_user_id          — id of the user who took the action (nullable
 *                            for system events)
 *   actor_name_snapshot    — name AT THE TIME of the event
 *   actor_email_snapshot   — email at the time
 *   actor_role_snapshot    — role at the time
 *   from_role              — for transfer events, the role the complaint
 *                            moved FROM (auto_assigned_role before update)
 *   to_role                — for transfer events, the role it moved TO
 *   from_status / to_status — for status_changed events
 *   note                   — free-text note (e.g., the transfer reason or
 *                            admin reply body)
 *   created_at             — when the event happened
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (exists) return;

  await knex.schema.createTable("complaint_events", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("complaint_id").notNullable();
    table.string("event_type", 32).notNullable();
    table.bigInteger("actor_user_id").nullable();
    table.string("actor_name_snapshot", 200).nullable();
    table.string("actor_email_snapshot", 200).nullable();
    table.string("actor_role_snapshot", 64).nullable();
    table.string("from_role", 64).nullable();
    table.string("to_role", 64).nullable();
    table.string("from_status", 32).nullable();
    table.string("to_status", 32).nullable();
    table.text("note").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["complaint_id", "created_at"], "idx_complaint_events_complaint_at");
    table.index("event_type", "idx_complaint_events_type");
  });
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (exists) await knex.schema.dropTable("complaint_events");
};
