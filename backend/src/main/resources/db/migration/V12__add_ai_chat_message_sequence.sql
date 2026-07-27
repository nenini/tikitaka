ALTER TABLE `chatbot_messages`
	ADD COLUMN `sequenceNo` BIGINT NULL;

CREATE TEMPORARY TABLE `tmp_chatbot_message_sequence` AS
SELECT
	`chatbotMessageId`,
	ROW_NUMBER() OVER (
		PARTITION BY `chatbotConversationId`
		ORDER BY `createdAt`, `chatbotMessageId`
	) AS `sequenceNo`
FROM `chatbot_messages`;

UPDATE `chatbot_messages`
SET `sequenceNo` = (
	SELECT `ranked`.`sequenceNo`
	FROM `tmp_chatbot_message_sequence` `ranked`
	WHERE `ranked`.`chatbotMessageId` = `chatbot_messages`.`chatbotMessageId`
);

DROP TABLE `tmp_chatbot_message_sequence`;

ALTER TABLE `chatbot_messages`
	MODIFY COLUMN `sequenceNo` BIGINT NOT NULL;

ALTER TABLE `chatbot_messages`
	ADD CONSTRAINT `UK_CHATBOT_MESSAGE_CONVERSATION_SEQUENCE`
		UNIQUE (`chatbotConversationId`, `sequenceNo`);

CREATE INDEX `IX_CHATBOT_MESSAGE_CONVERSATION_CREATED`
	ON `chatbot_messages` (`chatbotConversationId`, `createdAt`);
