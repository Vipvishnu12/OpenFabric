-- Seed data is idempotent so repeated initialization does not duplicate rows.
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user123', 'read', 'transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user123' AND action = 'read' AND resource = 'transactions' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user123', 'write', 'transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user123' AND action = 'write' AND resource = 'transactions' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user123', 'delete', 'transactions', 'deny'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user123' AND action = 'delete' AND resource = 'transactions' AND effect = 'deny'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user123', 'read', 'accounts', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user123' AND action = 'read' AND resource = 'accounts' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user456', 'read', 'wallets/*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user456' AND action = 'read' AND resource = 'wallets/*' AND effect = 'allow'
);

-- Specific wallet permissions used by the precedence tests.
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user456', 'write', 'wallets/wallet-789', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user456' AND action = 'write' AND resource = 'wallets/wallet-789' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user456', 'read', 'wallets/wallet-789/transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user456' AND action = 'read' AND resource = 'wallets/wallet-789/transactions' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user789', 'write', 'wallets/*/transactions/*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user789' AND action = 'write' AND resource = 'wallets/*/transactions/*' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'admin789', 'read', '*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'admin789' AND action = 'read' AND resource = '*' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'admin789', 'write', '*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'admin789' AND action = 'write' AND resource = '*' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'admin789', 'delete', '*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'admin789' AND action = 'delete' AND resource = '*' AND effect = 'allow'
);

-- Fixture user for the integration tests.
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'vzjkWOywoqatwE1F2xRQ6WkhBf7R5HlT@clients', 'read', 'transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'vzjkWOywoqatwE1F2xRQ6WkhBf7R5HlT@clients' AND action = 'read' AND resource = 'transactions' AND effect = 'allow'
);

-- Logged-in demo users from the successful Auth0 browser flow.
-- Permission lookups use the verified Auth0 `sub` claim, not the display email.
INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'auth0|6acf0f80347c3a318a08e379', 'read', 'transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'auth0|6acf0f80347c3a318a08e379' AND action = 'read' AND resource = 'transactions' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user3@gmail.com', 'read', 'wallets/wallet-789/transactions', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user3@gmail.com' AND action = 'read' AND resource = 'wallets/wallet-789/transactions' AND effect = 'allow'
);

INSERT INTO user_permissions (user_id, action, resource, effect)
SELECT 'user4@gmail.com', 'write', 'wallets/*/transactions/*', 'allow'
WHERE NOT EXISTS (
    SELECT 1 FROM user_permissions
    WHERE user_id = 'user4@gmail.com' AND action = 'write' AND resource = 'wallets/*/transactions/*' AND effect = 'allow'
);
