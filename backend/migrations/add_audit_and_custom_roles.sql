-- Permission Audit Log table
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id SERIAL PRIMARY KEY,
  action_type VARCHAR(50) NOT NULL,
  target_role VARCHAR(100),
  target_user_id VARCHAR(255),
  target_user_name VARCHAR(255),
  changed_by_id VARCHAR(255) NOT NULL,
  changed_by_name VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(100),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON permission_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON permission_audit_log(action_type);

-- Custom Roles table
CREATE TABLE IF NOT EXISTS custom_roles (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#6B7280',
  icon VARCHAR(50) DEFAULT 'Shield',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_active ON custom_roles(is_active) WHERE is_active = true;
