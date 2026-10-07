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
  CONSTRAINT fk_receipts_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_receipts_operation FOREIGN KEY (operation_id) REFERENCES operations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_closures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id BIGINT UNSIGNED NOT NULL,
  cash_session_id BIGINT UNSIGNED NOT NULL,
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
