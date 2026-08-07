UPDATE badge_catalog
SET code = 'FIRST_CHAT',
    updatedAt = CURRENT_TIMESTAMP
WHERE code = 'FIRST_SESSION';
