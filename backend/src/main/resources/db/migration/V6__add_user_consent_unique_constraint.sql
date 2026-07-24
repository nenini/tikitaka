ALTER TABLE `user_consents`
	ADD CONSTRAINT `UK_USER_CONSENT_USER_TYPE`
	UNIQUE (`userId`, `consentTypeId`);
