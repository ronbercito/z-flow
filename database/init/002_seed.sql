INSERT IGNORE INTO roles (id, code, name) VALUES
  (1, 'OWNER', 'Propietario'),
  (2, 'PARTNER', 'Socio'),
  (3, 'BRANCH_ADMIN', 'Administrador de filial'),
  (4, 'CASHIER', 'Cajero / Encargado'),
  (5, 'AUDITOR', 'Auditor');

INSERT IGNORE INTO branches (id, code, name, address)
VALUES (1, 'MIR', 'Miraflores', 'Av. Larco 1234, Miraflores, Lima');

INSERT INTO branch_settings
  (branch_id, max_operation_amount, commission_type, commission_value, staff_share_pct, partner_share_pct)
VALUES (1, 50.00, 'FLAT', 1.00, 100.00, 0.00)
ON DUPLICATE KEY UPDATE branch_id = VALUES(branch_id);
