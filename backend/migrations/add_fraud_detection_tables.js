exports.up = async function(knex) {
  const hasIpAddress = await knex.schema.hasColumn('referrals', 'ip_address');
  if (!hasIpAddress) {
    await knex.schema.alterTable('referrals', (table) => {
      table.string('ip_address', 45);
      table.text('user_agent');
      table.string('device_fingerprint', 255);
      table.string('geo_country', 100);
      table.string('geo_city', 100);
    });
  }
  console.log('Added columns to referrals');

  const hasRiskScores = await knex.schema.hasTable('referral_risk_scores');
  if (!hasRiskScores) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS referral_risk_scores (
        id SERIAL PRIMARY KEY,
        referral_id INTEGER REFERENCES referrals(id) ON DELETE CASCADE,
        ambassador_id UUID,
        risk_score DECIMAL(5,2) DEFAULT 0,
        risk_level VARCHAR(20) DEFAULT 'low',
        triggered_rules JSONB DEFAULT '[]',
        ai_analysis TEXT,
        ai_explanation TEXT,
        recommended_action VARCHAR(50),
        assessed_at TIMESTAMP DEFAULT NOW(),
        assessed_by VARCHAR(50) DEFAULT 'system',
        UNIQUE(referral_id)
      )
    `);
  }
  console.log('Created referral_risk_scores table');

  const hasAiFraudScans = await knex.schema.hasTable('ai_fraud_scans');
  if (!hasAiFraudScans) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS ai_fraud_scans (
        id SERIAL PRIMARY KEY,
        ambassador_id UUID,
        building_number INTEGER,
        scan_type VARCHAR(20) DEFAULT 'manual',
        status VARCHAR(20) DEFAULT 'pending',
        total_referrals INTEGER DEFAULT 0,
        flagged_count INTEGER DEFAULT 0,
        high_risk_count INTEGER DEFAULT 0,
        medium_risk_count INTEGER DEFAULT 0,
        low_risk_count INTEGER DEFAULT 0,
        summary TEXT,
        ai_report JSONB,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        triggered_by UUID
      )
    `);
  }
  console.log('Created ai_fraud_scans table');

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_referrals_ip ON referrals(ip_address)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_risk_scores_level ON referral_risk_scores(risk_level)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_risk_scores_ambassador ON referral_risk_scores(ambassador_id)');
  console.log('Created indexes');
};

exports.down = async function(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_risk_scores_ambassador');
  await knex.raw('DROP INDEX IF EXISTS idx_risk_scores_level');
  await knex.raw('DROP INDEX IF EXISTS idx_referrals_ip');

  await knex.schema.dropTableIfExists('ai_fraud_scans');
  await knex.schema.dropTableIfExists('referral_risk_scores');
  
  const hasIpAddress = await knex.schema.hasColumn('referrals', 'ip_address');
  if (hasIpAddress) {
    await knex.schema.alterTable('referrals', (table) => {
      table.dropColumn('geo_city');
      table.dropColumn('geo_country');
      table.dropColumn('device_fingerprint');
      table.dropColumn('user_agent');
      table.dropColumn('ip_address');
    });
  }
};
