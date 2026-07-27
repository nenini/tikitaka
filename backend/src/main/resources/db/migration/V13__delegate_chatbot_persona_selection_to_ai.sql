ALTER TABLE `chatbot_conversations`
	MODIFY COLUMN `chatbotPersonaId` BIGINT;

ALTER TABLE `chatbot_conversations`
	ADD COLUMN `aiPersonaKey` VARCHAR(100) NULL;

CREATE INDEX `IX_CHATBOT_CONVERSATION_AI_PERSONA_KEY`
	ON `chatbot_conversations` (`aiPersonaKey`);
