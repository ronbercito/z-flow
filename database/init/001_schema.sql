CREATE TABLE IF NOT EXISTS branches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branches_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(140) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_settings (
  branch_id BIGINT UNSIGNED NOT NULL,
  max_operation_amount DECIMAL(14,2) NOT NULL DEFAULT 50.00,
  commission_type ENUM('FLAT','PERCENT') NOT NULL DEFAULT 'FLAT',
  commission_value DECIMAL(14,2) NOT NULL DEFAULT 1.00,
  staff_share_pct DECIMAL(5,2) NULL,
  partner_share_pct DECIMAL(5,2) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id),
  CONSTRAINT fk_branch_settings_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  initial_cash DECIMAL(14,2) NOT NULL DEFAULT 0,
  initial_wallet DECIMAL(14,2) NOT NULL DEFAULT 0,
  declared_cash DECIMAL(14,2) NULL,
  declared_wallet DECIMAL(14,2) NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_cash_sessions_branch_status (branch_id, status),
  CONSTRAINT fk_cash_sessions_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_cash_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NOT NULL,
  cash_session_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  operation_type ENUM('YAPE_TO_CASH','CASH_TO_YAPE') NOT NULL,
  reference_code VARCHAR(80) NULL,
  customer_name VARCHAR(140) NULL,
  amount DECIMAL(14,2) NOT NULL,
  commission DECIMAL(14,2) NOT NULL,
  staff_share_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  partner_share_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(14,2) NOT NULL,
  notes VARCHAR(255) NULL,
  status ENUM('COMPLETED','IN_PROGRESS','CANCELLED','REVERSED') NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operations_branch_reference (branch_id, reference_code),
  KEY idx_operations_branch_created (branch_id, created_at),
  CONSTRAINT fk_operations_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_operations_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  CONSTRAINT fk_operations_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NOT NULL,
  operation_id BIGINT UNSIGNED NOT NULL,
  series VARCHAR(20) NOT NULL,
  sequence_number BIGINT UNSIGNED NOT NULL,
  receipt_type ENUM('INTERNAL_TICKET','ELECTRONIC_RECEIPT') NOT NULL DEFAULT 'INTERNAL_TICKET',
  status ENUM('ISSUED','VOID') NOT NULL DEFAULT 'ISSUED',
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_receipts_series_number (series, sequence_number),
  UNIQUE KEY uq_receipts_operation (operation_id),
  CONSTRAINT fk_receipts_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_receipts_operation FOREIGN KEY (operation_id) REFERENCES operations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_closures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NOT NULL,
  cash_session_id BIGINT UNSIGNED NOT NULL,
  operation_count INT UNSIGNED NOT NULL DEFAULT 0,
  commission_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  staff_share_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  partner_share_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_cash DECIMAL(14,2) NOT NULL,
  declared_cash DECIMAL(14,2) NOT NULL,
  expected_wallet DECIMAL(14,2) NOT NULL,
  declared_wallet DECIMAL(14,2) NOT NULL,
  difference_cash DECIMAL(14,2) NOT NULL,
  difference_wallet DECIMAL(14,2) NOT NULL,
  notes VARCHAR(255) NULL,
  closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_daily_closures_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_daily_closures_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Authentication/session schema (also auto-created by the API for existing installations)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_user (user_id),
  KEY idx_auth_sessions_expiry (expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS receipt_sequences (
  branch_id BIGINT UNSIGNED NOT NULL,
  next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id),
  CONSTRAINT fk_receipt_sequences_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Stage 4 local production schema
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL AFTER details,
  ADD COLUMN IF NOT EXISTS user_agent VARCHAR(255) NULL AFTER ip_address;

CREATE TABLE IF NOT EXISTS system_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  business_name VARCHAR(140) NOT NULL DEFAULT 'Z-FLOW',
  legal_name VARCHAR(180) NULL,
  ruc VARCHAR(20) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  currency_code VARCHAR(8) NOT NULL DEFAULT 'PEN',
  timezone_name VARCHAR(80) NOT NULL DEFAULT 'America/Lima',
  ticket_footer VARCHAR(255) NULL,
  receipt_prefix VARCHAR(12) NOT NULL DEFAULT 'ZF',
  default_max_operation_amount DECIMAL(14,2) NOT NULL DEFAULT 50.00,
  default_commission_type ENUM('FLAT','PERCENT') NOT NULL DEFAULT 'FLAT',
  default_commission_value DECIMAL(14,2) NOT NULL DEFAULT 1.00,
  default_staff_share_pct DECIMAL(5,2) NULL,
  default_partner_share_pct DECIMAL(5,2) NULL,
  require_cash_to_yape_reference TINYINT(1) NOT NULL DEFAULT 0,
  allow_cashier_cancel TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_system_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_settings (id, business_name)
VALUES (1, 'Z-FLOW')
ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS operation_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  action ENUM('CANCEL','REVERSE') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operation_events_operation (operation_id),
  KEY idx_operation_events_branch (branch_id, created_at),
  CONSTRAINT fk_operation_events_operation FOREIGN KEY (operation_id) REFERENCES operations(id),
  CONSTRAINT fk_operation_events_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_operation_events_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_session_handoffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cash_session_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  from_user_id BIGINT UNSIGNED NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_handoffs_session (cash_session_id, created_at),
  CONSTRAINT fk_handoff_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  CONSTRAINT fk_handoff_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_handoff_from_user FOREIGN KEY (from_user_id) REFERENCES users(id),
  CONSTRAINT fk_handoff_to_user FOREIGN KEY (to_user_id) REFERENCES users(id),
  CONSTRAINT fk_handoff_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_partner_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  pool_share_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_branch_partner (branch_id, user_id),
  CONSTRAINT fk_branch_partner_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_branch_partner_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS operation_partner_shares (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  pool_share_pct DECIMAL(5,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operation_partner_share (operation_id, user_id),
  KEY idx_partner_share_user (user_id, created_at),
  CONSTRAINT fk_operation_partner_share_operation FOREIGN KEY (operation_id) REFERENCES operations(id),
  CONSTRAINT fk_operation_partner_share_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_operation_partner_share_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
