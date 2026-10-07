INSERT IGNORE INTO roles (id, code, name) VALUES
  (1, 'OWNER', 'Propietario'),
  (2, 'PARTNER', 'Socio'),
  (3, 'BRANCH_ADMIN', 'Administrador de filial'),
  (4, 'CASHIER', 'Cajero / Encargado'),
  (5, 'AUDITOR', 'Auditor');

INSERT IGNORE INTO branches (id, code, name, address)
VALUES (1, 'MIR', 'Miraflores', 'Av. Larco 1234, Miraflores, Lima');

INSERT INTO branch_settings (branch_id, max_operation_amount, commission_type, commission_value)
VALUES (1, 50.00, 'FLAT', 1.00)
ON DUPLICATE KEY UPDATE branch_id = VALUES(branch_id);

INSERT INTO cash_sessions (id, branch_id, initial_cash, initial_wallet, status, started_at)
SELECT 1, 1, 1000.00, 800.00, 'OPEN', CONCAT(CURDATE(), ' 08:00:00')
WHERE NOT EXISTS (SELECT 1 FROM cash_sessions WHERE id = 1);

INSERT INTO operations
  (branch_id, cash_session_id, operation_type, reference_code, customer_name, amount, commission, net_amount, status, created_at)
SELECT * FROM (
  SELECT 1,1,'YAPE_TO_CASH','850421','Luis Torres',50.00,1.00,49.00,'COMPLETED',CONCAT(CURDATE(),' 12:28:00') UNION ALL
  SELECT 1,1,'YAPE_TO_CASH','850420','Ana Quispe',50.00,1.00,49.00,'COMPLETED',CONCAT(CURDATE(),' 12:15:00') UNION ALL
  SELECT 1,1,'CASH_TO_YAPE','850418','Carlos Rojas',40.00,1.00,39.00,'COMPLETED',CONCAT(CURDATE(),' 11:52:00') UNION ALL
  SELECT 1,1,'YAPE_TO_CASH','850417','María Pérez',40.00,1.00,39.00,'COMPLETED',CONCAT(CURDATE(),' 11:30:00') UNION ALL
  SELECT 1,1,'CASH_TO_YAPE','850416','Jorge Lima',50.00,1.00,49.00,'IN_PROGRESS',CONCAT(CURDATE(),' 11:05:00') UNION ALL
  SELECT 1,1,'YAPE_TO_CASH','850415','Sofía Vega',30.00,1.00,29.00,'COMPLETED',CONCAT(CURDATE(),' 10:45:00') UNION ALL
  SELECT 1,1,'YAPE_TO_CASH','850414','Diego Ramos',50.00,1.00,49.00,'COMPLETED',CONCAT(CURDATE(),' 10:20:00') UNION ALL
  SELECT 1,1,'CASH_TO_YAPE','850413','Patricia Gil',50.00,1.00,49.00,'COMPLETED',CONCAT(CURDATE(),' 09:58:00')
) AS seed(branch_id,cash_session_id,operation_type,reference_code,customer_name,amount,commission,net_amount,status,created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM operations o WHERE o.branch_id = 1 AND o.reference_code = seed.reference_code
);
