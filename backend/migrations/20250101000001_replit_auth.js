// Replit Auth has been removed from the codebase. This migration used to
// create `replit_users` and `replit_sessions`, with a broken FK that failed
// on every Render deploy (replit_users.local_user_id was INTEGER but
// users.id is UUID). Repurposed to drop the tables if they ever got
// created on any environment, and to do nothing otherwise. Safe to run on
// fresh databases.
exports.up = async function (knex) {
  await knex.schema.dropTableIfExists("replit_sessions");
  await knex.schema.dropTableIfExists("replit_users");
};

exports.down = async function () {
  // Intentionally empty — Replit Auth is gone for good.
};
