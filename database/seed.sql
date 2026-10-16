-- user2@example.com
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user2@example.com', 'read', 'transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user2@example.com'
      AND action = 'read'
      AND resource = 'transactions'
      AND effect = 'allow'
);

-- user3@gmail.com
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user3@gmail.com', 'read',
       'wallets/wallet-789/transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user3@gmail.com'
      AND action = 'read'
      AND resource = 'wallets/wallet-789/transactions'
      AND effect = 'allow'
);

-- user4@gmail.com
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user4@gmail.com', 'write',
       'wallets/*/transactions/*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user4@gmail.com'
      AND action = 'write'
      AND resource = 'wallets/*/transactions/*'
      AND effect = 'allow'
);