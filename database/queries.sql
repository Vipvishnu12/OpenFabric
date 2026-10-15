-- Verify that the table exists.
SELECT name
FROM sqlite_master
WHERE type = 'table' AND name = 'user_permissions';

-- Display all permission records.
SELECT id, user_id, action, resource, effect
FROM user_permissions
ORDER BY id;

-- Retrieve permissions for a specific user.
SELECT id, user_id, action, resource, effect
FROM user_permissions
WHERE user_id = 'user123'
ORDER BY id;

-- Count records by user.
SELECT user_id, COUNT(*) AS permission_count
FROM user_permissions
GROUP BY user_id
ORDER BY user_id;

-- Verify the initialized sample data.
SELECT COUNT(*) AS initialized_sample_count
FROM user_permissions
WHERE (user_id = 'user123' AND action = 'read' AND resource = 'transactions' AND effect = 'allow')
   OR (user_id = 'user123' AND action = 'write' AND resource = 'transactions' AND effect = 'allow')
   OR (user_id = 'user123' AND action = 'delete' AND resource = 'transactions' AND effect = 'deny')
   OR (user_id = 'user123' AND action = 'read' AND resource = 'accounts' AND effect = 'allow')
   OR (user_id = 'user456' AND action = 'read' AND resource = 'wallets/*' AND effect = 'allow')
   OR (user_id = 'user456' AND action = 'write' AND resource = 'wallets/wallet-789' AND effect = 'allow')
   OR (user_id = 'user456' AND action = 'read' AND resource = 'wallets/wallet-789/transactions' AND effect = 'allow')
   OR (user_id = 'user789' AND action = 'write' AND resource = 'wallets/*/transactions/*' AND effect = 'allow')
   OR (user_id = 'admin789' AND action = 'read' AND resource = '*' AND effect = 'allow')
   OR (user_id = 'admin789' AND action = 'write' AND resource = '*' AND effect = 'allow')
   OR (user_id = 'admin789' AND action = 'delete' AND resource = '*' AND effect = 'allow');
