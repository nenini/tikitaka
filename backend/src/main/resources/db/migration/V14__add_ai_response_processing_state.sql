ALTER TABLE `chatbot_conversations`
	ADD COLUMN `aiResponseState` VARCHAR(20) NOT NULL DEFAULT 'IDLE';

ALTER TABLE `chatbot_conversations`
	ADD COLUMN `pendingUserMessageId` BIGINT NULL;

ALTER TABLE `chatbot_conversations`
	ADD COLUMN `lastAiResponseErrorCode` VARCHAR(100) NULL;

CREATE INDEX `IX_CHATBOT_CONVERSATION_RESPONSE_STATE`
	ON `chatbot_conversations` (`userId`, `aiResponseState`);
