ALTER TABLE `chatbot_conversations`
	ADD COLUMN `purpose` VARCHAR(30) NOT NULL DEFAULT 'DATE_PRACTICE';

CREATE INDEX `IX_CHATBOT_CONVERSATION_USER_STATUS`
	ON `chatbot_conversations` (`userId`, `status`);
