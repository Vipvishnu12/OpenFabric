DELETE FROM user_permissions
WHERE user_id NOT IN (
  'auth0|6acf0f80347c3a318a08e379',
  'auth0|6acf0fae620fbdf352e40234',
  'auth0|6acf11141830a1fdcf3c92a6'
);

-- auth0|6acf0f80347c3a318a08e379
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'auth0|6acf0f80347c3a318a08e379', 'read', 'transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'auth0|6acf0f80347c3a318a08e379'
      AND action = 'read'
      AND resource = 'transactions'
      AND effect = 'allow'
);

-- auth0|6acf0fae620fbdf352e40234
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'auth0|6acf0fae620fbdf352e40234', 'read', 'wallets/wallet-789/transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'auth0|6acf0fae620fbdf352e40234'
      AND action = 'read'
      AND resource = 'wallets/wallet-789/transactions'
      AND effect = 'allow'
);

-- auth0|6acf11141830a1fdcf3c92a6
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'auth0|6acf11141830a1fdcf3c92a6', 'write', 'wallets/*/transactions/*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'auth0|6acf11141830a1fdcf3c92a6'
      AND action = 'write'
      AND resource = 'wallets/*/transactions/*'
      AND effect = 'allow'
);