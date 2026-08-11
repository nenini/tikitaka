ALTER TABLE `users`
    MODIFY COLUMN `birthDate` DATE NULL;

ALTER TABLE `oauth_accounts`
    ADD CONSTRAINT `UK_OAUTH_PROVIDER_USER` UNIQUE (`provider`, `providerUserId`);

ALTER TABLE `oauth_accounts`
    ADD CONSTRAINT `UK_OAUTH_USER_PROVIDER` UNIQUE (`userId`, `provider`);
