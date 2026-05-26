/**
 * Phase 4 — HR depth schema. Two new tables:
 *
 *   employee_contracts — start/end dates + status + optional file
 *   employee_evaluations — per-evaluation ratings (1-5) + notes
 *
 * Attendance stays activity-based (computed at read time from
 * users.last_login_at + complaint_events) so we don't need a new
 * table for it.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable("employee_contracts"))) {
    await knex.schema.createTable("employee_contracts", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("user_id").notNullable();
      table.date("start_date").notNullable();
      table.date("end_date").nullable();
      table.string("status", 32).notNullable().defaultTo("active"); // active / ended / draft
      table.string("contract_type", 64).nullable(); // full_time, part_time, contract
      table.string("file_path", 500).nullable();
      table.text("notes").nullable();
      table.uuid("created_by").nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.index(["user_id", "status"], "idx_employee_contracts_user_status");
      table.index("end_date", "idx_employee_contracts_end");
    });
  }
  if (!(await knex.schema.hasTable("employee_evaluations"))) {
    await knex.schema.createTable("employee_evaluations", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("user_id").notNullable();
      table.uuid("evaluator_id").nullable();
      table.string("evaluator_name_snapshot", 200).nullable();
      table.string("evaluator_role_snapshot", 64).nullable();
      table.integer("response_speed").nullable();   // 1-5
      table.integer("interaction_quality").nullable(); // 1-5
      table.integer("commitment").nullable();        // 1-5
      table.text("notes").nullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.index(["user_id", "created_at"], "idx_employee_evaluations_user");
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable("employee_evaluations")) await knex.schema.dropTable("employee_evaluations");
  if (await knex.schema.hasTable("employee_contracts"))   await knex.schema.dropTable("employee_contracts");
};
