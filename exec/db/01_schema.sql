
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `active_match_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `active_match_requests` (
  `userId` bigint NOT NULL,
  `matchRequestId` bigint NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `UK_active_match_requests_request` (`matchRequestId`),
  CONSTRAINT `FK_match_requests_TO_active_match_requests` FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
  CONSTRAINT `FK_users_TO_active_match_requests` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ai_coaching_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_coaching_events` (
  `event_id` varchar(100) NOT NULL,
  `session_id` bigint NOT NULL,
  `target_user_id` bigint NOT NULL,
  `event_type` varchar(40) NOT NULL,
  `version` int NOT NULL,
  `source` varchar(80) NOT NULL,
  `coaching_type` varchar(50) NOT NULL,
  `message_key` varchar(100) NOT NULL,
  `message_text` varchar(500) DEFAULT NULL,
  `priority` varchar(20) NOT NULL,
  `reason_code` varchar(100) NOT NULL,
  `triggered_elapsed_ms` bigint NOT NULL,
  `expires_elapsed_ms` bigint NOT NULL,
  `deduplication_key` varchar(255) NOT NULL,
  `delivery_status` varchar(20) NOT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  `delivered_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `UK_ai_coaching_events_deduplication` (`deduplication_key`),
  KEY `FK_users_TO_ai_coaching_events` (`target_user_id`),
  KEY `IDX_ai_coaching_exposure_policy` (`session_id`,`target_user_id`,`coaching_type`,`delivery_status`,`delivered_at`),
  KEY `IDX_ai_coaching_session_received` (`session_id`,`received_at`),
  CONSTRAINT `FK_sessions_TO_ai_coaching_events` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_ai_coaching_events` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_ai_coaching_events_elapsed` CHECK (((`triggered_elapsed_ms` >= 0) and (`expires_elapsed_ms` >= `triggered_elapsed_ms`))),
  CONSTRAINT `CK_ai_coaching_events_status` CHECK ((`delivery_status` in (_utf8mb4'DELIVERED',_utf8mb4'EXPIRED',_utf8mb4'SUPPRESSED'))),
  CONSTRAINT `CK_ai_coaching_events_version` CHECK ((`version` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ai_session_analysis_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_session_analysis_events` (
  `event_id` varchar(100) NOT NULL,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `analysis_type` varchar(20) NOT NULL,
  `event_type` varchar(80) NOT NULL,
  `source` varchar(80) NOT NULL,
  `version` int NOT NULL,
  `participant_identity` varchar(255) DEFAULT NULL,
  `client_instance_id` varchar(100) DEFAULT NULL,
  `sequence_number` bigint DEFAULT NULL,
  `session_elapsed_ms` bigint NOT NULL,
  `confidence` decimal(6,5) DEFAULT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `model_version` varchar(128) DEFAULT NULL,
  `rule_version` varchar(128) DEFAULT NULL,
  `payload_json` longtext NOT NULL,
  `received_at` datetime(6) NOT NULL,
  PRIMARY KEY (`event_id`),
  KEY `FK_users_TO_ai_session_analysis_events` (`user_id`),
  KEY `IDX_ai_analysis_session_user_elapsed` (`session_id`,`user_id`,`session_elapsed_ms`),
  KEY `IDX_ai_analysis_session_type_event` (`session_id`,`analysis_type`,`event_type`),
  CONSTRAINT `FK_sessions_TO_ai_session_analysis_events` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_ai_session_analysis_events` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_ai_session_analysis_events_confidence` CHECK (((`confidence` is null) or ((`confidence` >= 0) and (`confidence` <= 1)))),
  CONSTRAINT `CK_ai_session_analysis_events_elapsed` CHECK ((`session_elapsed_ms` >= 0)),
  CONSTRAINT `CK_ai_session_analysis_events_type` CHECK ((`analysis_type` in (_utf8mb4'VOICE',_utf8mb4'VISION'))),
  CONSTRAINT `CK_ai_session_analysis_events_version` CHECK ((`version` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_penalties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_penalties` (
  `attendancePenaltyId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `sessionId` bigint DEFAULT NULL,
  `penaltyType` varchar(20) NOT NULL,
  `temperatureDelta` int NOT NULL DEFAULT '0',
  `noShowCountDelta` int NOT NULL DEFAULT '0',
  `expiresAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`attendancePenaltyId`),
  UNIQUE KEY `UK_attendance_penalties_session_user_type` (`sessionId`,`userId`,`penaltyType`),
  KEY `IDX_attendance_penalties_user_type` (`userId`,`penaltyType`,`createdAt`),
  CONSTRAINT `FK_sessions_TO_attendance_penalties_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_attendance_penalties_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `badge_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `badge_catalog` (
  `badgeId` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `conditionType` varchar(500) DEFAULT NULL,
  `thresholdCount` int DEFAULT NULL,
  `iconUrl` varchar(100) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT NULL,
  `displayOrder` int DEFAULT NULL,
  `policyVersion` varchar(50) NOT NULL DEFAULT 'badge-v1.0.0',
  PRIMARY KEY (`badgeId`),
  UNIQUE KEY `uk_badge_catalog_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chatbot_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chatbot_conversations` (
  `chatbotConversationId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `chatbotPersonaId` bigint DEFAULT NULL,
  `conversationStage` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `lastUserMessageAt` datetime DEFAULT NULL,
  `proactiveMessageSentAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closedAt` datetime DEFAULT NULL,
  `purpose` varchar(30) NOT NULL DEFAULT 'DATE_PRACTICE',
  `aiPersonaKey` varchar(100) DEFAULT NULL,
  `aiResponseState` varchar(20) NOT NULL DEFAULT 'IDLE',
  `pendingUserMessageId` bigint DEFAULT NULL,
  `lastAiResponseErrorCode` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`chatbotConversationId`),
  KEY `FK_chatbot_personas_TO_chatbot_conversations_1` (`chatbotPersonaId`),
  KEY `IX_CHATBOT_CONVERSATION_USER_STATUS` (`userId`,`status`),
  KEY `IX_CHATBOT_CONVERSATION_AI_PERSONA_KEY` (`aiPersonaKey`),
  KEY `IX_CHATBOT_CONVERSATION_RESPONSE_STATE` (`userId`,`aiResponseState`),
  CONSTRAINT `FK_chatbot_personas_TO_chatbot_conversations_1` FOREIGN KEY (`chatbotPersonaId`) REFERENCES `chatbot_personas` (`chatbotPersonaId`),
  CONSTRAINT `FK_users_TO_chatbot_conversations_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chatbot_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chatbot_messages` (
  `chatbotMessageId` bigint NOT NULL AUTO_INCREMENT,
  `chatbotConversationId` bigint NOT NULL,
  `senderType` varchar(20) NOT NULL,
  `messageText` text NOT NULL,
  `isProactive` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sequenceNo` bigint NOT NULL,
  PRIMARY KEY (`chatbotMessageId`),
  UNIQUE KEY `UK_CHATBOT_MESSAGE_CONVERSATION_SEQUENCE` (`chatbotConversationId`,`sequenceNo`),
  KEY `IX_CHATBOT_MESSAGE_CONVERSATION_CREATED` (`chatbotConversationId`,`createdAt`),
  CONSTRAINT `FK_chatbot_conversations_TO_chatbot_messages_1` FOREIGN KEY (`chatbotConversationId`) REFERENCES `chatbot_conversations` (`chatbotConversationId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chatbot_personas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chatbot_personas` (
  `chatbotPersonaId` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `speechStyle` varchar(100) NOT NULL,
  `difficulty` varchar(20) NOT NULL,
  `personality` varchar(30) NOT NULL,
  `reactionLevel` varchar(20) NOT NULL,
  `systemPrompt` text NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`chatbotPersonaId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `coaching_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coaching_events` (
  `coachingEventId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `targetUserId` bigint NOT NULL,
  `eventType` varchar(40) NOT NULL,
  `severity` varchar(20) NOT NULL DEFAULT 'INFO',
  `eventTimeSec` int NOT NULL,
  `message` varchar(500) NOT NULL,
  `displayedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `feedbackType` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`coachingEventId`),
  KEY `FK_sessions_TO_coaching_events_1` (`sessionId`),
  KEY `FK_users_TO_coaching_events_1` (`targetUserId`),
  CONSTRAINT `FK_sessions_TO_coaching_events_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_coaching_events_1` FOREIGN KEY (`targetUserId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `consent_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consent_types` (
  `consentTypeId` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `version` varchar(20) NOT NULL,
  `isRequired` tinyint(1) NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`consentTypeId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `contact_exchange_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_exchange_requests` (
  `contactExchangeRequestId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `requesterUserId` bigint NOT NULL,
  `targetUserId` bigint NOT NULL,
  `requesterAgreed` tinyint(1) NOT NULL DEFAULT '1',
  `targetAgreed` tinyint(1) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `extensionAgreed` tinyint(1) NOT NULL DEFAULT '0',
  `requestedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `respondedAt` datetime DEFAULT NULL,
  `disclosedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`contactExchangeRequestId`),
  UNIQUE KEY `UK_contact_exchange_requests_session` (`sessionId`),
  KEY `FK_users_TO_contact_exchange_requests_1` (`requesterUserId`),
  KEY `FK_users_TO_contact_exchange_requests_2` (`targetUserId`),
  CONSTRAINT `FK_sessions_TO_contact_exchange_requests_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_contact_exchange_requests_1` FOREIGN KEY (`requesterUserId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_contact_exchange_requests_2` FOREIGN KEY (`targetUserId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `face_analysis_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `face_analysis_requests` (
  `analysisRequestId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `failureCode` varchar(50) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` datetime NOT NULL,
  `completedAt` datetime DEFAULT NULL,
  `failedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`analysisRequestId`),
  KEY `IDX_face_analysis_requests_user_status` (`userId`,`status`),
  KEY `IDX_face_analysis_requests_status_expires` (`status`,`expiresAt`),
  CONSTRAINT `FK_users_TO_face_analysis_requests` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_face_analysis_requests_completed` CHECK ((((`status` = _utf8mb4'COMPLETED') and (`completedAt` is not null)) or ((`status` <> _utf8mb4'COMPLETED') and (`completedAt` is null)))),
  CONSTRAINT `CK_face_analysis_requests_failed` CHECK ((((`status` = _utf8mb4'FAILED') and (`failureCode` is not null) and (`failedAt` is not null)) or ((`status` <> _utf8mb4'FAILED') and (`failureCode` is null) and (`failedAt` is null)))),
  CONSTRAINT `CK_face_analysis_requests_failure_code` CHECK (((`failureCode` is null) or (`failureCode` in (_utf8mb4'NO_FACE',_utf8mb4'MULTIPLE_FACES',_utf8mb4'LOW_LIGHT',_utf8mb4'OVEREXPOSED',_utf8mb4'SEVERE_BLUR',_utf8mb4'EXTREME_HEAD_POSE',_utf8mb4'INVALID_IMAGE')))),
  CONSTRAINT `CK_face_analysis_requests_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'COMPLETED',_utf8mb4'FAILED',_utf8mb4'EXPIRED')))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `face_analysis_result_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `face_analysis_result_tags` (
  `faceAnalysisResultTagId` bigint NOT NULL AUTO_INCREMENT,
  `faceAnalysisResultId` bigint NOT NULL,
  `faceTagId` bigint NOT NULL,
  `relativeScore` decimal(8,6) NOT NULL,
  `rankOrder` smallint NOT NULL,
  PRIMARY KEY (`faceAnalysisResultTagId`),
  UNIQUE KEY `UK_face_analysis_result_tags_face_tag` (`faceAnalysisResultId`,`faceTagId`),
  UNIQUE KEY `UK_face_analysis_result_tags_rank` (`faceAnalysisResultId`,`rankOrder`),
  KEY `FK_face_tag_catalog_TO_face_analysis_result_tags` (`faceTagId`),
  CONSTRAINT `FK_face_analysis_results_TO_tags` FOREIGN KEY (`faceAnalysisResultId`) REFERENCES `face_analysis_results` (`faceAnalysisResultId`),
  CONSTRAINT `FK_face_tag_catalog_TO_face_analysis_result_tags` FOREIGN KEY (`faceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
  CONSTRAINT `CK_face_analysis_result_tags_rank` CHECK ((`rankOrder` > 0)),
  CONSTRAINT `CK_face_analysis_result_tags_score` CHECK (((`relativeScore` >= 0) and (`relativeScore` <= 1)))
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `face_analysis_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `face_analysis_results` (
  `faceAnalysisResultId` bigint NOT NULL AUTO_INCREMENT,
  `analysisRequestId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `primaryFaceTagId` bigint NOT NULL,
  `modelVersion` varchar(100) NOT NULL,
  `analyzedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`faceAnalysisResultId`),
  UNIQUE KEY `UK_face_analysis_results_request` (`analysisRequestId`),
  KEY `FK_face_tag_catalog_TO_face_analysis_results` (`primaryFaceTagId`),
  KEY `IDX_face_analysis_results_user_analyzed` (`userId`,`analyzedAt`),
  CONSTRAINT `FK_face_analysis_requests_TO_results` FOREIGN KEY (`analysisRequestId`) REFERENCES `face_analysis_requests` (`analysisRequestId`),
  CONSTRAINT `FK_face_tag_catalog_TO_face_analysis_results` FOREIGN KEY (`primaryFaceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
  CONSTRAINT `FK_users_TO_face_analysis_results` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `face_tag_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `face_tag_catalog` (
  `face_tag_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(50) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `applicableGender` varchar(20) NOT NULL DEFAULT 'ALL',
  `displayOrder` smallint NOT NULL DEFAULT '1',
  PRIMARY KEY (`face_tag_id`),
  UNIQUE KEY `UK_face_tag_catalog_code` (`code`),
  CONSTRAINT `CK_face_tag_catalog_applicable_gender` CHECK ((`applicableGender` in (_utf8mb4'ALL',_utf8mb4'MALE',_utf8mb4'FEMALE')))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `face_tag_examples`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `face_tag_examples` (
  `faceTagExampleId` bigint NOT NULL AUTO_INCREMENT,
  `faceTagId` bigint NOT NULL,
  `celebrityName` varchar(100) NOT NULL,
  `displayOrder` smallint NOT NULL DEFAULT '1',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`faceTagExampleId`),
  KEY `FK_face_tag_catalog_TO_face_tag_examples_1` (`faceTagId`),
  CONSTRAINT `FK_face_tag_catalog_TO_face_tag_examples_1` FOREIGN KEY (`faceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `flyway_schema_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `flyway_schema_history` (
  `installed_rank` int NOT NULL,
  `version` varchar(50) DEFAULT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_time` int NOT NULL,
  `success` tinyint(1) NOT NULL,
  PRIMARY KEY (`installed_rank`),
  KEY `flyway_schema_history_s_idx` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `growth_metric_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `growth_metric_snapshots` (
  `growthMetricSnapshotId` bigint NOT NULL AUTO_INCREMENT,
  `sessionReportId` bigint NOT NULL,
  `sessionId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `analysisVersion` varchar(50) NOT NULL,
  `aggregationVersion` varchar(50) NOT NULL,
  `flowScore` decimal(5,2) DEFAULT NULL,
  `questionScore` decimal(5,2) DEFAULT NULL,
  `listeningScore` decimal(5,2) DEFAULT NULL,
  `reactionScore` decimal(5,2) DEFAULT NULL,
  `balanceScore` decimal(5,2) DEFAULT NULL,
  `nonverbalScore` decimal(5,2) DEFAULT NULL,
  `measuredAt` datetime(6) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`growthMetricSnapshotId`),
  UNIQUE KEY `uk_growth_snapshot_report_version` (`sessionReportId`,`aggregationVersion`),
  KEY `fk_growth_snapshot_session` (`sessionId`),
  KEY `idx_growth_snapshot_user_measured` (`userId`,`measuredAt`),
  KEY `idx_growth_snapshot_user_session` (`userId`,`sessionId`),
  CONSTRAINT `fk_growth_snapshot_report` FOREIGN KEY (`sessionReportId`) REFERENCES `session_reports` (`sessionReportId`),
  CONSTRAINT `fk_growth_snapshot_session` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `fk_growth_snapshot_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `livekit_webhook_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `livekit_webhook_events` (
  `event_id` varchar(255) NOT NULL,
  `event_type` varchar(80) NOT NULL,
  `room_name` varchar(255) NOT NULL,
  `participant_identity` varchar(255) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  PRIMARY KEY (`event_id`),
  KEY `IDX_livekit_webhook_events_received_at` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `love_temperature_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `love_temperature_histories` (
  `loveTemperatureHistoryId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `sessionId` bigint DEFAULT NULL,
  `changeType` varchar(30) NOT NULL,
  `temperatureDelta` int NOT NULL DEFAULT '0',
  `temperatureBefore` int NOT NULL,
  `temperatureAfter` int NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`loveTemperatureHistoryId`),
  KEY `FK_users_TO_love_temperature_histories_1` (`userId`),
  KEY `FK_sessions_TO_love_temperature_histories_1` (`sessionId`),
  CONSTRAINT `FK_sessions_TO_love_temperature_histories_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_love_temperature_histories_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_jobs` (
  `matchJobId` bigint NOT NULL AUTO_INCREMENT,
  `matchRequestId` bigint NOT NULL,
  `status` varchar(20) NOT NULL,
  `attemptCount` int NOT NULL DEFAULT '0',
  `availableAt` datetime NOT NULL,
  `claimedAt` datetime DEFAULT NULL,
  `completedAt` datetime DEFAULT NULL,
  `failedAt` datetime DEFAULT NULL,
  `workerId` varchar(100) DEFAULT NULL,
  `lastError` varchar(1000) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`matchJobId`),
  KEY `IDX_match_jobs_claim` (`status`,`availableAt`,`matchJobId`),
  KEY `IDX_match_jobs_request_status` (`matchRequestId`,`status`),
  CONSTRAINT `FK_match_requests_TO_match_jobs` FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
  CONSTRAINT `CK_match_jobs_attempt_count` CHECK ((`attemptCount` >= 0)),
  CONSTRAINT `CK_match_jobs_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'PROCESSING',_utf8mb4'COMPLETED',_utf8mb4'FAILED')))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_pairs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_pairs` (
  `matchPairId` bigint NOT NULL AUTO_INCREMENT,
  `requesterAId` bigint NOT NULL,
  `requesterBId` bigint NOT NULL,
  `userAId` bigint NOT NULL,
  `userBId` bigint NOT NULL,
  `totalScore` decimal(6,3) NOT NULL,
  `goalScore` decimal(6,3) DEFAULT NULL,
  `conversationScore` decimal(6,3) DEFAULT NULL,
  `scheduleScore` decimal(6,3) DEFAULT NULL,
  `preferenceScore` decimal(6,3) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `acceptDeadlineAt` datetime NOT NULL,
  `matchedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `proposedScheduledAt` datetime NOT NULL,
  `faceScore` decimal(6,3) NOT NULL DEFAULT '0.000',
  `traitScore` decimal(6,3) NOT NULL DEFAULT '0.000',
  `scheduledAt` datetime DEFAULT NULL,
  `confirmedAt` datetime DEFAULT NULL,
  `cancelledAt` datetime DEFAULT NULL,
  `cancelledBy` bigint DEFAULT NULL,
  `cancellationReason` varchar(500) DEFAULT NULL,
  `isLateCancellation` tinyint(1) NOT NULL DEFAULT '0',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `policyVersion` bigint NOT NULL DEFAULT '1',
  `lateCancellationMinutesSnapshot` int NOT NULL DEFAULT '60',
  `recentMatchExclusionDaysSnapshot` int NOT NULL DEFAULT '7',
  `closedAt` datetime DEFAULT NULL,
  `completedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`matchPairId`),
  UNIQUE KEY `UK_match_pairs_requests` (`requesterAId`,`requesterBId`),
  KEY `FK_match_requests_TO_match_pairs_2` (`requesterBId`),
  KEY `FK_users_TO_match_pairs_cancelled_by` (`cancelledBy`),
  KEY `IDX_match_pairs_status_deadline` (`status`,`acceptDeadlineAt`),
  KEY `IDX_match_pairs_proposed_schedule` (`status`,`proposedScheduledAt`),
  KEY `IDX_match_pairs_user_a_cooldown` (`userAId`,`status`,`closedAt`,`completedAt`),
  KEY `IDX_match_pairs_user_b_cooldown` (`userBId`,`status`,`closedAt`,`completedAt`),
  KEY `IDX_match_pairs_confirmed_schedule` (`status`,`scheduledAt`),
  CONSTRAINT `FK_match_requests_TO_match_pairs_1` FOREIGN KEY (`requesterAId`) REFERENCES `match_requests` (`matchRequestId`),
  CONSTRAINT `FK_match_requests_TO_match_pairs_2` FOREIGN KEY (`requesterBId`) REFERENCES `match_requests` (`matchRequestId`),
  CONSTRAINT `FK_users_TO_match_pairs_1` FOREIGN KEY (`userAId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_match_pairs_2` FOREIGN KEY (`userBId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_match_pairs_cancelled_by` FOREIGN KEY (`cancelledBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_match_pairs_distinct_requests` CHECK ((`requesterAId` < `requesterBId`)),
  CONSTRAINT `CK_match_pairs_distinct_users` CHECK ((`userAId` <> `userBId`)),
  CONSTRAINT `CK_match_pairs_scores` CHECK (((`faceScore` between 0 and 100) and (`traitScore` between 0 and 100) and (`totalScore` between 0 and 100) and (`totalScore` = (`faceScore` + `traitScore`)))),
  CONSTRAINT `CK_match_pairs_status` CHECK ((`status` in (_utf8mb4'PENDING_ACCEPTANCE',_utf8mb4'CONFIRMED',_utf8mb4'COMPLETED',_utf8mb4'REJECTED',_utf8mb4'CANCELLED',_utf8mb4'EXPIRED')))
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_request_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_request_slots` (
  `matchRequestSlotId` bigint NOT NULL AUTO_INCREMENT,
  `matchRequestId` bigint NOT NULL,
  `dayOfWeek` varchar(10) NOT NULL,
  `startTime` time NOT NULL,
  `endTime` time NOT NULL,
  `timezone` varchar(50) NOT NULL DEFAULT 'Asia/Seoul',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`matchRequestSlotId`),
  UNIQUE KEY `UK_match_request_slots` (`matchRequestId`,`dayOfWeek`,`startTime`,`endTime`),
  KEY `IDX_match_request_slots_request_day` (`matchRequestId`,`dayOfWeek`),
  CONSTRAINT `FK_match_requests_TO_match_request_slots` FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
  CONSTRAINT `CK_match_request_slots_day` CHECK ((`dayOfWeek` in (_utf8mb4'MONDAY',_utf8mb4'TUESDAY',_utf8mb4'WEDNESDAY',_utf8mb4'THURSDAY',_utf8mb4'FRIDAY',_utf8mb4'SATURDAY',_utf8mb4'SUNDAY'))),
  CONSTRAINT `CK_match_request_slots_time` CHECK ((`startTime` < `endTime`))
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_request_trait_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_request_trait_snapshots` (
  `matchRequestTraitSnapshotId` bigint NOT NULL AUTO_INCREMENT,
  `matchRequestId` bigint NOT NULL,
  `traitId` bigint NOT NULL,
  `snapshotType` varchar(20) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`matchRequestTraitSnapshotId`),
  UNIQUE KEY `UK_match_request_trait_snapshots` (`matchRequestId`,`traitId`,`snapshotType`),
  KEY `FK_trait_catalog_TO_match_request_trait_snapshots` (`traitId`),
  KEY `IDX_match_request_trait_snapshots_request_type` (`matchRequestId`,`snapshotType`),
  CONSTRAINT `FK_match_requests_TO_trait_snapshots` FOREIGN KEY (`matchRequestId`) REFERENCES `match_requests` (`matchRequestId`),
  CONSTRAINT `FK_trait_catalog_TO_match_request_trait_snapshots` FOREIGN KEY (`traitId`) REFERENCES `trait_catalog` (`traitId`),
  CONSTRAINT `CK_match_request_trait_snapshots_type` CHECK ((`snapshotType` in (_utf8mb4'SELF',_utf8mb4'PREFERRED')))
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_requests` (
  `matchRequestId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `status` varchar(20) NOT NULL,
  `preferredStartAt` datetime DEFAULT NULL,
  `preferredEndAt` datetime DEFAULT NULL,
  `requestedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelledAt` datetime DEFAULT NULL,
  `rejectedAt` datetime DEFAULT NULL,
  `preferredAgeMin` smallint NOT NULL,
  `preferredAgeMax` smallint NOT NULL,
  `preferredFaceTagId` bigint NOT NULL,
  `actualFaceTagId` bigint NOT NULL,
  `matchedAt` datetime DEFAULT NULL,
  `expiresAt` datetime DEFAULT NULL,
  `cancellationReason` varchar(500) DEFAULT NULL,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `waitingStartedAt` datetime NOT NULL,
  `settingRecommendationSentAt` datetime DEFAULT NULL,
  `completedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`matchRequestId`),
  KEY `FK_users_TO_match_requests_1` (`userId`),
  KEY `FK_face_tag_catalog_TO_match_requests_preferred` (`preferredFaceTagId`),
  KEY `FK_face_tag_catalog_TO_match_requests_actual` (`actualFaceTagId`),
  KEY `IDX_match_requests_status_requested` (`status`,`requestedAt`,`matchRequestId`),
  KEY `IDX_match_requests_status_waiting_started` (`status`,`waitingStartedAt`,`matchRequestId`),
  CONSTRAINT `FK_face_tag_catalog_TO_match_requests_actual` FOREIGN KEY (`actualFaceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
  CONSTRAINT `FK_face_tag_catalog_TO_match_requests_preferred` FOREIGN KEY (`preferredFaceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
  CONSTRAINT `FK_users_TO_match_requests_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_match_requests_preferred_age` CHECK ((((`preferredAgeMin` is null) and (`preferredAgeMax` is null)) or ((`preferredAgeMin` > 0) and (`preferredAgeMax` >= `preferredAgeMin`)))),
  CONSTRAINT `CK_match_requests_status` CHECK ((`status` in (_utf8mb4'WAITING',_utf8mb4'MATCH_FOUND',_utf8mb4'CONFIRMED',_utf8mb4'COMPLETED',_utf8mb4'REJECTED',_utf8mb4'CANCELLED',_utf8mb4'EXPIRED')))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `match_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `match_responses` (
  `match_response_id` bigint NOT NULL AUTO_INCREMENT,
  `match_pair_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `response` varchar(20) NOT NULL,
  `responded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`match_response_id`),
  UNIQUE KEY `UK_match_responses_pair_user` (`match_pair_id`,`user_id`),
  KEY `FK_users_TO_match_responses_1` (`user_id`),
  CONSTRAINT `FK_match_pairs_TO_match_responses_1` FOREIGN KEY (`match_pair_id`) REFERENCES `match_pairs` (`matchPairId`),
  CONSTRAINT `FK_users_TO_match_responses_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_match_responses_response` CHECK ((`response` in (_utf8mb4'PENDING',_utf8mb4'ACCEPTED',_utf8mb4'REJECTED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `matching_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `matching_policies` (
  `matchingPolicyId` bigint NOT NULL,
  `faceTypeWeight` int NOT NULL,
  `personalityWeight` int NOT NULL,
  `acceptTimeoutHours` int NOT NULL,
  `minimumAcceptanceWindowMinutes` int NOT NULL,
  `minimumPreparationMinutes` int NOT NULL,
  `scheduleSearchDays` int NOT NULL,
  `recentMatchExclusionDays` int NOT NULL,
  `lateCancellationMinutes` int NOT NULL,
  `policyVersion` bigint NOT NULL,
  `updatedBy` bigint DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`matchingPolicyId`),
  KEY `FK_users_TO_matching_policies_updated_by` (`updatedBy`),
  CONSTRAINT `FK_users_TO_matching_policies_updated_by` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_matching_policies_values` CHECK (((`acceptTimeoutHours` between 1 and 24) and (`minimumAcceptanceWindowMinutes` between 1 and (`acceptTimeoutHours` * 60)) and (`minimumPreparationMinutes` between 0 and 1440) and (`scheduleSearchDays` between 1 and 30) and (`recentMatchExclusionDays` between 1 and 365) and (`lateCancellationMinutes` between 1 and 1440) and (`policyVersion` > 0))),
  CONSTRAINT `CK_matching_policies_weights` CHECK (((`faceTypeWeight` between 0 and 100) and (`personalityWeight` between 0 and 100) and ((`faceTypeWeight` + `personalityWeight`) = 100)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mission_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mission_catalog` (
  `mission_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(60) NOT NULL,
  `practice_goal_code` varchar(50) NOT NULL,
  `title` varchar(100) NOT NULL,
  `description` varchar(500) NOT NULL,
  `target_value` int NOT NULL,
  `progress_unit` varchar(20) NOT NULL,
  `display_order` smallint NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`mission_id`),
  UNIQUE KEY `UK_mission_catalog_code` (`code`),
  KEY `IDX_mission_catalog_goal_active` (`practice_goal_code`,`is_active`,`display_order`),
  CONSTRAINT `FK_mission_catalog_practice_goal_code` FOREIGN KEY (`practice_goal_code`) REFERENCES `practice_goal_catalog` (`code`),
  CONSTRAINT `CK_mission_catalog_target_value` CHECK ((`target_value` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_jobs` (
  `notificationJobId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `notificationType` varchar(50) NOT NULL,
  `title` varchar(200) NOT NULL,
  `content` varchar(1000) NOT NULL,
  `relatedType` varchar(30) DEFAULT NULL,
  `relatedId` bigint DEFAULT NULL,
  `presentation` varchar(30) NOT NULL DEFAULT 'BELL_AND_TOAST',
  `deduplicationKey` varchar(200) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `scheduledAt` datetime NOT NULL,
  `availableAt` datetime NOT NULL,
  `attemptCount` int NOT NULL DEFAULT '0',
  `claimedAt` datetime DEFAULT NULL,
  `completedAt` datetime DEFAULT NULL,
  `cancelledAt` datetime DEFAULT NULL,
  `failedAt` datetime DEFAULT NULL,
  `workerId` varchar(100) DEFAULT NULL,
  `lastError` varchar(1000) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notificationJobId`),
  UNIQUE KEY `UK_notification_jobs_deduplication_key` (`deduplicationKey`),
  KEY `IDX_notification_jobs_claim` (`status`,`availableAt`,`notificationJobId`),
  KEY `IDX_notification_jobs_reference` (`relatedType`,`relatedId`,`status`),
  KEY `IDX_notification_jobs_user` (`userId`,`createdAt`),
  CONSTRAINT `FK_users_TO_notification_jobs_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notificationId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `notificationType` varchar(50) NOT NULL,
  `title` varchar(200) NOT NULL,
  `content` varchar(1000) NOT NULL,
  `relatedType` varchar(30) DEFAULT NULL,
  `relatedId` bigint DEFAULT NULL,
  `presentation` varchar(30) NOT NULL DEFAULT 'BELL_AND_TOAST',
  `deduplicationKey` varchar(200) DEFAULT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT '0',
  `sentAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `readAt` datetime DEFAULT NULL,
  PRIMARY KEY (`notificationId`),
  UNIQUE KEY `UK_notifications_deduplication_key` (`deduplicationKey`),
  KEY `IDX_notifications_user_read_sent` (`userId`,`isRead`,`sentAt`,`notificationId`),
  KEY `IDX_notifications_related` (`relatedType`,`relatedId`),
  KEY `IDX_notifications_user_id` (`userId`,`notificationId`),
  CONSTRAINT `FK_users_TO_notifications_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `oauth_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `oauth_accounts` (
  `oauthAccountId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `provider` varchar(20) NOT NULL,
  `providerUserId` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`oauthAccountId`),
  UNIQUE KEY `UK_OAUTH_PROVIDER_USER` (`provider`,`providerUserId`),
  UNIQUE KEY `UK_OAUTH_USER_PROVIDER` (`userId`,`provider`),
  CONSTRAINT `FK_users_TO_oauth_accounts_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `passwordResetTokenId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `usedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`passwordResetTokenId`),
  UNIQUE KEY `UK_PASSWORD_RESET_TOKENS_TOKEN_HASH` (`tokenHash`),
  KEY `IDX_PASSWORD_RESET_TOKENS_USER_ID` (`userId`),
  KEY `IDX_PASSWORD_RESET_TOKENS_EXPIRES_AT` (`expiresAt`),
  CONSTRAINT `FK_USERS_TO_PASSWORD_RESET_TOKENS` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `peer_evaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `peer_evaluations` (
  `peer_evaluation_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `evaluator_user_id` bigint NOT NULL,
  `evaluatee_user_id` bigint NOT NULL,
  `comfort_score` int NOT NULL,
  `question_connection_score` int NOT NULL,
  `listening_score` int NOT NULL,
  `reaction_score` int NOT NULL,
  `balance_score` int NOT NULL,
  `manner_score` int NOT NULL,
  `good_behavior_text` varchar(1000) DEFAULT NULL,
  `improvement_text` varchar(1000) DEFAULT NULL,
  `submitted_at` datetime(6) NOT NULL,
  PRIMARY KEY (`peer_evaluation_id`),
  UNIQUE KEY `UK_peer_evaluations_session_evaluator` (`session_id`,`evaluator_user_id`),
  KEY `FK_evaluator_users_TO_peer_evaluations` (`evaluator_user_id`),
  KEY `FK_evaluatee_users_TO_peer_evaluations` (`evaluatee_user_id`),
  KEY `IDX_peer_evaluations_session` (`session_id`,`submitted_at`),
  CONSTRAINT `FK_evaluatee_users_TO_peer_evaluations` FOREIGN KEY (`evaluatee_user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_evaluator_users_TO_peer_evaluations` FOREIGN KEY (`evaluator_user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_sessions_TO_peer_evaluations` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `CK_peer_evaluations_distinct_users` CHECK ((`evaluator_user_id` <> `evaluatee_user_id`)),
  CONSTRAINT `CK_peer_evaluations_score_range` CHECK (((`comfort_score` between 1 and 5) and (`question_connection_score` between 1 and 5) and (`listening_score` between 1 and 5) and (`reaction_score` between 1 and 5) and (`balance_score` between 1 and 5) and (`manner_score` between 1 and 5)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `peer_evaluations_legacy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `peer_evaluations_legacy` (
  `peerEvaluationId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `evaluatorUserId` bigint NOT NULL,
  `evaluateeUserId` bigint NOT NULL,
  `comfortScore` tinyint NOT NULL,
  `questionConnectionScore` tinyint NOT NULL,
  `listeningScore` tinyint NOT NULL,
  `reactionScore` tinyint NOT NULL,
  `balanceScore` tinyint NOT NULL,
  `mannerScore` tinyint NOT NULL,
  `goodBehaviorText` varchar(1000) DEFAULT NULL,
  `improvementText` varchar(1000) DEFAULT NULL,
  `submittedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`peerEvaluationId`),
  KEY `FK_sessions_TO_peer_evaluations_1` (`sessionId`),
  KEY `FK_users_TO_peer_evaluations_1` (`evaluatorUserId`),
  KEY `FK_users_TO_peer_evaluations_2` (`evaluateeUserId`),
  CONSTRAINT `FK_sessions_TO_peer_evaluations_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_peer_evaluations_1` FOREIGN KEY (`evaluatorUserId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_peer_evaluations_2` FOREIGN KEY (`evaluateeUserId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `practice_goal_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `practice_goal_catalog` (
  `practiceGoalId` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `goalCategory` varchar(30) NOT NULL DEFAULT 'OTHER',
  `displayOrder` smallint NOT NULL DEFAULT '1',
  PRIMARY KEY (`practiceGoalId`),
  UNIQUE KEY `UK_practice_goal_catalog_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `question_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_cards` (
  `question_card_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `category` varchar(40) NOT NULL,
  `content` varchar(300) NOT NULL,
  `sensitive` tinyint(1) NOT NULL DEFAULT '0',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `display_order` int NOT NULL,
  PRIMARY KEY (`question_card_id`),
  UNIQUE KEY `UK_question_cards_code` (`code`),
  KEY `IDX_question_cards_active_sensitive` (`active`,`sensitive`,`display_order`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `question_recommendation_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_recommendation_events` (
  `event_id` varchar(100) NOT NULL,
  `session_id` bigint NOT NULL,
  `target_user_id` bigint NOT NULL,
  `deduplication_key` varchar(255) NOT NULL,
  `triggered_elapsed_ms` bigint NOT NULL,
  `expires_elapsed_ms` bigint NOT NULL,
  `delivery_status` varchar(20) NOT NULL,
  `source` varchar(80) NOT NULL,
  `version` int NOT NULL,
  `context_summary` varchar(1000) DEFAULT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  `delivered_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `UK_question_recommendations_deduplication` (`deduplication_key`),
  KEY `FK_sessions_TO_question_recommendation_events` (`session_id`),
  KEY `FK_users_TO_question_recommendation_events` (`target_user_id`),
  CONSTRAINT `FK_sessions_TO_question_recommendation_events` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_question_recommendation_events` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_question_recommendation_elapsed` CHECK (((`triggered_elapsed_ms` >= 0) and (`expires_elapsed_ms` >= `triggered_elapsed_ms`))),
  CONSTRAINT `CK_question_recommendation_status` CHECK ((`delivery_status` in (_utf8mb4'DELIVERED',_utf8mb4'EXPIRED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `question_recommendation_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_recommendation_items` (
  `question_recommendation_item_id` bigint NOT NULL AUTO_INCREMENT,
  `event_id` varchar(100) NOT NULL,
  `sequence_no` int NOT NULL,
  `content` varchar(500) NOT NULL,
  PRIMARY KEY (`question_recommendation_item_id`),
  UNIQUE KEY `UK_question_recommendation_sequence` (`event_id`,`sequence_no`),
  CONSTRAINT `FK_question_recommendation_events_TO_items` FOREIGN KEY (`event_id`) REFERENCES `question_recommendation_events` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refresh_tokens` (
  `refreshTokenId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `tokenHash` varchar(255) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `revokedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastUsedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`refreshTokenId`),
  KEY `FK_users_TO_refresh_tokens_1` (`userId`),
  CONSTRAINT `FK_users_TO_refresh_tokens_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_evidences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_evidences` (
  `reportEvidenceId` bigint NOT NULL AUTO_INCREMENT,
  `reportId` bigint NOT NULL,
  `evidenceType` varchar(30) NOT NULL,
  `objectKey` varchar(1000) NOT NULL,
  `originalFileName` varchar(255) DEFAULT NULL,
  `contentType` varchar(100) DEFAULT NULL,
  `contentText` longtext,
  `sizeBytes` bigint NOT NULL,
  `capturedAt` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`reportEvidenceId`),
  KEY `IDX_report_evidences_report` (`reportId`,`reportEvidenceId`),
  CONSTRAINT `FK_reports_TO_report_evidences` FOREIGN KEY (`reportId`) REFERENCES `reports` (`reportId`) ON DELETE CASCADE,
  CONSTRAINT `CK_report_evidences_size` CHECK ((`sizeBytes` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `reportId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint DEFAULT NULL,
  `reporterUserId` bigint NOT NULL,
  `reportedUserId` bigint NOT NULL,
  `reportType` varchar(50) NOT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'RECEIVED',
  `reportedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolvedAt` datetime DEFAULT NULL,
  `sessionStatusSnapshot` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`reportId`),
  UNIQUE KEY `UK_reports_session_reporter_reported` (`sessionId`,`reporterUserId`,`reportedUserId`),
  KEY `FK_users_TO_reports_1` (`reporterUserId`),
  KEY `FK_users_TO_reports_2` (`reportedUserId`),
  CONSTRAINT `FK_sessions_TO_reports_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_reports_1` FOREIGN KEY (`reporterUserId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_reports_2` FOREIGN KEY (`reportedUserId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `room_device_checks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `room_device_checks` (
  `roomDeviceCheckId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `cameraPassed` tinyint(1) NOT NULL,
  `microphonePassed` tinyint(1) NOT NULL,
  `speakerPassed` tinyint(1) NOT NULL,
  `networkPassed` tinyint(1) NOT NULL,
  `checkedAt` datetime NOT NULL,
  PRIMARY KEY (`roomDeviceCheckId`),
  KEY `FK_users_TO_room_device_checks` (`userId`),
  KEY `IDX_room_device_checks_latest` (`sessionId`,`userId`,`checkedAt`,`roomDeviceCheckId`),
  CONSTRAINT `FK_sessions_TO_room_device_checks` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_room_device_checks` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `room_themes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `room_themes` (
  `room_theme_id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `placeType` varchar(30) NOT NULL,
  `backgroundUrl` varchar(1000) DEFAULT NULL,
  `ambienceAudioUrl` varchar(1000) DEFAULT NULL,
  `startTime` time DEFAULT NULL,
  `endTime` time DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`room_theme_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `safety_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `safety_events` (
  `event_id` varchar(100) NOT NULL,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `category` varchar(50) NOT NULL,
  `ai_severity` varchar(20) NOT NULL,
  `effective_severity` varchar(20) NOT NULL,
  `occurrence_count` int NOT NULL,
  `manner_penalty_score` int NOT NULL,
  `reason_code` varchar(100) NOT NULL,
  `warning_message` varchar(500) NOT NULL,
  `confidence` decimal(6,5) DEFAULT NULL,
  `deduplication_key` varchar(255) NOT NULL,
  `session_elapsed_ms` bigint NOT NULL,
  `source` varchar(80) NOT NULL,
  `version` int NOT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  `warning_delivered_at` datetime(6) NOT NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `UK_safety_events_deduplication` (`deduplication_key`),
  KEY `FK_users_TO_safety_events` (`user_id`),
  KEY `IDX_safety_events_repeat_policy` (`session_id`,`user_id`,`category`,`occurred_at`),
  KEY `IDX_safety_events_report` (`session_id`,`effective_severity`,`session_elapsed_ms`),
  CONSTRAINT `FK_sessions_TO_safety_events` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_safety_events` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_safety_events_confidence` CHECK (((`confidence` is null) or ((`confidence` >= 0) and (`confidence` <= 1)))),
  CONSTRAINT `CK_safety_events_severity` CHECK (((`ai_severity` in (_utf8mb4'LOW',_utf8mb4'MEDIUM',_utf8mb4'HIGH')) and (`effective_severity` in (_utf8mb4'LOW',_utf8mb4'MEDIUM',_utf8mb4'HIGH')))),
  CONSTRAINT `CK_safety_events_values` CHECK (((`occurrence_count` > 0) and (`manner_penalty_score` >= 0) and (`session_elapsed_ms` >= 0) and (`version` > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `safety_events_legacy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `safety_events_legacy` (
  `safetyEventId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `category` varchar(50) NOT NULL,
  `severity` varchar(20) NOT NULL,
  `sourceType` varchar(20) NOT NULL,
  `eventTimeSec` int NOT NULL,
  `contextSummary` varchar(1000) DEFAULT NULL,
  `evidenceExcerpt` text,
  `alternativeExpression` varchar(1000) DEFAULT NULL,
  `temperaturePenalty` decimal(6,2) NOT NULL DEFAULT '0.00',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`safetyEventId`),
  KEY `FK_sessions_TO_safety_events_1` (`sessionId`),
  KEY `FK_users_TO_safety_events_1` (`userId`),
  CONSTRAINT `FK_sessions_TO_safety_events_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_safety_events_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sanctions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sanctions` (
  `sanctionId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `reportId` bigint DEFAULT NULL,
  `sanctionType` varchar(30) NOT NULL,
  `reason` varchar(1000) NOT NULL,
  `startsAt` datetime NOT NULL,
  `endsAt` datetime DEFAULT NULL,
  `createdBy` bigint DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sanctionId`),
  KEY `FK_users_TO_sanctions_2` (`createdBy`),
  KEY `FK_reports_TO_sanctions_1` (`reportId`),
  KEY `IDX_sanctions_user_active` (`userId`,`sanctionType`,`startsAt`,`endsAt`),
  CONSTRAINT `FK_reports_TO_sanctions_1` FOREIGN KEY (`reportId`) REFERENCES `reports` (`reportId`),
  CONSTRAINT `FK_users_TO_sanctions_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_sanctions_2` FOREIGN KEY (`createdBy`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_analysis_evidence_segments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_analysis_evidence_segments` (
  `evidence_segment_id` bigint NOT NULL AUTO_INCREMENT,
  `participant_analysis_id` bigint NOT NULL,
  `evidence_key` varchar(100) NOT NULL,
  `event_type` varchar(30) NOT NULL,
  `start_ms` bigint NOT NULL,
  `end_ms` bigint NOT NULL,
  `description` varchar(500) NOT NULL,
  PRIMARY KEY (`evidence_segment_id`),
  UNIQUE KEY `UK_participant_analysis_evidence` (`participant_analysis_id`,`evidence_key`),
  CONSTRAINT `FK_participant_analyses_TO_evidence_segments` FOREIGN KEY (`participant_analysis_id`) REFERENCES `session_participant_analyses` (`participant_analysis_id`),
  CONSTRAINT `CK_analysis_evidence_range` CHECK (((`start_ms` >= 0) and (`end_ms` >= `start_ms`))),
  CONSTRAINT `CK_analysis_evidence_type` CHECK ((`event_type` in (_utf8mb4'LONG_SILENCE',_utf8mb4'INTERRUPTION',_utf8mb4'BACKCHANNEL',_utf8mb4'GAZE_AWAY',_utf8mb4'FACE_MISSING',_utf8mb4'SMILE')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_analysis_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_analysis_receipts` (
  `analysis_receipt_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `schema_version` int NOT NULL,
  `analysis_version` varchar(50) NOT NULL,
  `payload_hash` varchar(64) NOT NULL,
  `duration_ms` bigint NOT NULL,
  `analyzed_at` datetime(6) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  PRIMARY KEY (`analysis_receipt_id`),
  UNIQUE KEY `UK_session_analysis_version` (`session_id`,`analysis_version`),
  KEY `IDX_session_analysis_received_at` (`received_at`),
  CONSTRAINT `FK_sessions_TO_session_analysis_receipts` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `CK_session_analysis_duration` CHECK ((`duration_ms` > 0)),
  CONSTRAINT `CK_session_analysis_schema_version` CHECK ((`schema_version` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_goals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_goals` (
  `session_goal_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `practice_goal_id` bigint DEFAULT NULL,
  `custom_goal` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`session_goal_id`),
  KEY `FK_sessions_TO_session_goals_1` (`session_id`),
  KEY `FK_users_TO_session_goals_1` (`user_id`),
  KEY `FK_practice_goal_catalog_TO_session_goals_1` (`practice_goal_id`),
  CONSTRAINT `FK_practice_goal_catalog_TO_session_goals_1` FOREIGN KEY (`practice_goal_id`) REFERENCES `practice_goal_catalog` (`practiceGoalId`),
  CONSTRAINT `FK_sessions_TO_session_goals_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_session_goals_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_metric_summaries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_metric_summaries` (
  `sessionMetricSummaryId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `speakingRatio` decimal(5,2) DEFAULT NULL,
  `questionCount` int NOT NULL DEFAULT '0',
  `followupQuestionCount` int NOT NULL DEFAULT '0',
  `interruptionCount` int NOT NULL DEFAULT '0',
  `overlapCount` int NOT NULL DEFAULT '0',
  `averageUtteranceSec` decimal(8,2) DEFAULT NULL,
  `silenceTotalSec` int NOT NULL DEFAULT '0',
  `fillerWordCount` int NOT NULL DEFAULT '0',
  `speakingSpeedWpm` decimal(8,2) DEFAULT NULL,
  `gazeRatio` decimal(5,2) DEFAULT NULL,
  `smileRatio` decimal(5,2) DEFAULT NULL,
  `nodCount` int NOT NULL DEFAULT '0',
  `faceAbsenceSec` int NOT NULL DEFAULT '0',
  `negativeExpressionCount` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sessionMetricSummaryId`),
  KEY `FK_sessions_TO_session_metric_summaries_1` (`sessionId`),
  KEY `FK_users_TO_session_metric_summaries_1` (`userId`),
  CONSTRAINT `FK_sessions_TO_session_metric_summaries_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_session_metric_summaries_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_missions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_missions` (
  `session_mission_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `mission_id` bigint NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ASSIGNED',
  `progress_value` int NOT NULL DEFAULT '0',
  `target_value` int NOT NULL,
  `assigned_at` datetime(6) NOT NULL,
  `completed_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`session_mission_id`),
  UNIQUE KEY `UK_session_missions_session_user_mission` (`session_id`,`user_id`,`mission_id`),
  KEY `FK_session_missions_user` (`user_id`),
  KEY `FK_session_missions_mission` (`mission_id`),
  KEY `IDX_session_missions_user_status` (`session_id`,`user_id`,`status`),
  CONSTRAINT `FK_session_missions_mission` FOREIGN KEY (`mission_id`) REFERENCES `mission_catalog` (`mission_id`),
  CONSTRAINT `FK_session_missions_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_session_missions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_session_missions_progress_value` CHECK ((`progress_value` >= 0)),
  CONSTRAINT `CK_session_missions_target_value` CHECK ((`target_value` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_participant_analyses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_participant_analyses` (
  `participant_analysis_id` bigint NOT NULL AUTO_INCREMENT,
  `analysis_receipt_id` bigint NOT NULL,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `analysis_status` varchar(20) NOT NULL,
  `axes_json` longtext,
  `metrics_json` longtext,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`participant_analysis_id`),
  UNIQUE KEY `UK_session_participant_analysis` (`analysis_receipt_id`,`user_id`),
  KEY `FK_users_TO_participant_analyses` (`user_id`),
  KEY `IDX_participant_analysis_session_user` (`session_id`,`user_id`),
  CONSTRAINT `FK_analysis_receipts_TO_participant_analyses` FOREIGN KEY (`analysis_receipt_id`) REFERENCES `session_analysis_receipts` (`analysis_receipt_id`),
  CONSTRAINT `FK_sessions_TO_participant_analyses` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_participant_analyses` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_participant_analysis_status` CHECK ((`analysis_status` in (_utf8mb4'COMPLETED',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_participants` (
  `session_participant_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `participant_role` varchar(10) NOT NULL,
  `participation_status` varchar(20) NOT NULL,
  `joined_at` datetime DEFAULT NULL,
  `left_at` datetime DEFAULT NULL,
  `expression_analysis_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `voice_analysis_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `participant_identity` varchar(255) NOT NULL DEFAULT '',
  `participant_sid` varchar(255) DEFAULT NULL,
  `connection_status` varchar(20) NOT NULL DEFAULT 'DISCONNECTED',
  `connected_at` datetime(6) DEFAULT NULL,
  `disconnected_at` datetime(6) DEFAULT NULL,
  `last_connection_event_at` datetime(6) DEFAULT NULL,
  `client_instance_id` varchar(100) DEFAULT NULL,
  `last_heartbeat_at` datetime(6) DEFAULT NULL,
  `reconnecting_at` datetime(6) DEFAULT NULL,
  `reconnect_deadline_at` datetime(6) DEFAULT NULL,
  `reconnected_at` datetime(6) DEFAULT NULL,
  `recovery_failed_at` datetime(6) DEFAULT NULL,
  `reconnect_attempt_count` int NOT NULL DEFAULT '0',
  `camera_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `microphone_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `network_quality` varchar(20) NOT NULL DEFAULT 'UNKNOWN',
  `media_state_updated_at` datetime(6) DEFAULT NULL,
  `network_quality_updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`session_participant_id`),
  UNIQUE KEY `UK_session_participants_session_user` (`session_id`,`user_id`),
  UNIQUE KEY `UK_session_participants_session_identity` (`session_id`,`participant_identity`),
  KEY `FK_users_TO_session_participants_1` (`user_id`),
  KEY `IDX_session_participants_connection_status` (`session_id`,`connection_status`),
  KEY `IDX_session_participants_heartbeat_monitor` (`connection_status`,`last_heartbeat_at`),
  KEY `IDX_session_participants_reconnect_monitor` (`connection_status`,`reconnect_deadline_at`),
  CONSTRAINT `FK_sessions_TO_session_participants_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_session_participants_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `session_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_reports` (
  `sessionReportId` bigint NOT NULL AUTO_INCREMENT,
  `sessionId` bigint NOT NULL,
  `userId` bigint NOT NULL,
  `reportStatus` varchar(20) NOT NULL,
  `aiFlowScore` decimal(5,2) DEFAULT NULL,
  `aiQuestionScore` decimal(5,2) DEFAULT NULL,
  `aiListeningScore` decimal(5,2) DEFAULT NULL,
  `aiReactionScore` decimal(5,2) DEFAULT NULL,
  `aiMannerScore` decimal(5,2) DEFAULT NULL,
  `aiNonverbalScore` decimal(5,2) DEFAULT NULL,
  `peerAverageScore` decimal(5,2) DEFAULT NULL,
  `strengthsJson` json DEFAULT NULL,
  `improvementsJson` json DEFAULT NULL,
  `nextMissionsJson` json DEFAULT NULL,
  `topicSummaryJson` json DEFAULT NULL,
  `summaryText` text,
  `generatedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `analysisVersion` varchar(50) DEFAULT NULL,
  `reportVersion` varchar(50) DEFAULT NULL,
  `generationMode` varchar(20) DEFAULT NULL,
  `failureCode` varchar(80) DEFAULT NULL,
  `failureReason` varchar(1000) DEFAULT NULL,
  `resultPayloadHash` varchar(64) DEFAULT NULL,
  `requestedAt` datetime(6) DEFAULT NULL,
  `generationStartedAt` datetime(6) DEFAULT NULL,
  `lastAttemptAt` datetime(6) DEFAULT NULL,
  `attemptCount` int NOT NULL DEFAULT '0',
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`sessionReportId`),
  UNIQUE KEY `UK_session_reports_session_user` (`sessionId`,`userId`),
  KEY `FK_users_TO_session_reports` (`userId`),
  KEY `IDX_session_reports_status_requested` (`reportStatus`,`requestedAt`),
  CONSTRAINT `FK_sessions_TO_session_reports` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_sessions_TO_session_reports_1` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_session_reports` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_session_reports_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_session_report_attempt_count` CHECK ((`attemptCount` >= 0)),
  CONSTRAINT `CK_session_report_generation_mode` CHECK (((`generationMode` is null) or (`generationMode` in (_utf8mb4'LLM',_utf8mb4'RULE_BASED',_utf8mb4'NONE')))),
  CONSTRAINT `CK_session_report_status` CHECK ((`reportStatus` in (_utf8mb4'PENDING',_utf8mb4'GENERATING',_utf8mb4'COMPLETED',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `sessionId` bigint NOT NULL AUTO_INCREMENT,
  `matchPairId` bigint DEFAULT NULL,
  `roomThemeId` bigint DEFAULT NULL,
  `sessionType` varchar(20) NOT NULL,
  `scenario` varchar(20) DEFAULT NULL,
  `cameraEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `status` varchar(30) NOT NULL,
  `scheduledStartAt` datetime NOT NULL,
  `actualStartAt` datetime DEFAULT NULL,
  `actualEndAt` datetime DEFAULT NULL,
  `plannedDurationSec` int NOT NULL DEFAULT '2100',
  `extensionDurationSec` int NOT NULL DEFAULT '0',
  `terminationReason` varchar(500) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `livekitRoomName` varchar(255) DEFAULT NULL,
  `ending_soon_notified_at` datetime(6) DEFAULT NULL,
  `ending_imminent_notified_at` datetime(6) DEFAULT NULL,
  `timer_expired_notified_at` datetime(6) DEFAULT NULL,
  `endedByUserId` bigint DEFAULT NULL,
  `evaluation_completion_notified_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`sessionId`),
  UNIQUE KEY `UK_sessions_match_pair` (`matchPairId`),
  UNIQUE KEY `UK_sessions_livekit_room_name` (`livekitRoomName`),
  KEY `FK_room_themes_TO_sessions_1` (`roomThemeId`),
  KEY `IDX_sessions_active_timer` (`status`,`timer_expired_notified_at`),
  KEY `IX_SESSIONS_ENDED_BY_USER` (`endedByUserId`),
  CONSTRAINT `FK_match_pairs_TO_sessions_1` FOREIGN KEY (`matchPairId`) REFERENCES `match_pairs` (`matchPairId`),
  CONSTRAINT `FK_room_themes_TO_sessions_1` FOREIGN KEY (`roomThemeId`) REFERENCES `room_themes` (`room_theme_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `silence_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `silence_events` (
  `event_id` varchar(100) NOT NULL,
  `session_id` bigint NOT NULL,
  `silence_started_elapsed_ms` bigint NOT NULL,
  `detected_elapsed_ms` bigint NOT NULL,
  `silence_duration_ms` bigint NOT NULL,
  `intervention_stage` varchar(40) NOT NULL,
  `source` varchar(80) NOT NULL,
  `version` int NOT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `UK_silence_events_episode_stage` (`session_id`,`silence_started_elapsed_ms`,`intervention_stage`),
  KEY `IDX_silence_events_session_detected` (`session_id`,`detected_elapsed_ms`),
  CONSTRAINT `FK_sessions_TO_silence_events` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `CK_silence_events_elapsed` CHECK (((`silence_started_elapsed_ms` >= 0) and (`detected_elapsed_ms` >= `silence_started_elapsed_ms`) and (`silence_duration_ms` >= 0))),
  CONSTRAINT `CK_silence_events_stage` CHECK ((`intervention_stage` in (_utf8mb4'NONE',_utf8mb4'TOPIC_HINT',_utf8mb4'QUESTION_CARD',_utf8mb4'CONTEXTUAL_QUESTIONS')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `temperature_change_histories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `temperature_change_histories` (
  `temperatureChangeHistoryId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `sessionId` bigint DEFAULT NULL,
  `sourceType` varchar(30) NOT NULL,
  `sourceId` bigint NOT NULL,
  `reason` varchar(50) NOT NULL,
  `delta` decimal(5,2) NOT NULL,
  `beforeTemperature` decimal(5,2) NOT NULL,
  `afterTemperature` decimal(5,2) NOT NULL,
  `policyVersion` varchar(50) NOT NULL,
  `changedAt` datetime(6) NOT NULL,
  PRIMARY KEY (`temperatureChangeHistoryId`),
  UNIQUE KEY `uk_temperature_history_source` (`sourceType`,`sourceId`,`policyVersion`),
  KEY `fk_temperature_history_session` (`sessionId`),
  KEY `idx_temperature_history_user_changed` (`userId`,`changedAt`),
  CONSTRAINT `fk_temperature_history_session` FOREIGN KEY (`sessionId`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `fk_temperature_history_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `trait_catalog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trait_catalog` (
  `traitId` bigint NOT NULL AUTO_INCREMENT,
  `traitType` varchar(30) NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(50) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `displayOrder` smallint NOT NULL DEFAULT '1',
  PRIMARY KEY (`traitId`),
  UNIQUE KEY `UK_trait_catalog_type_code` (`traitType`,`code`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_availability_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_availability_slots` (
  `availabilitySlotId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `dayOfWeek` tinyint NOT NULL,
  `startTime` time NOT NULL,
  `endTime` time NOT NULL,
  `timezone` varchar(50) NOT NULL DEFAULT 'Asia/Seoul',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`availabilitySlotId`),
  KEY `FK_users_TO_user_availability_slots_1` (`userId`),
  CONSTRAINT `FK_users_TO_user_availability_slots_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_badges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_badges` (
  `userBadgeId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `badgeId` bigint NOT NULL,
  `awardedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `isDisplayed` tinyint(1) NOT NULL DEFAULT '0',
  `awardPolicyVersion` varchar(50) NOT NULL DEFAULT 'badge-v1.0.0',
  PRIMARY KEY (`userBadgeId`),
  UNIQUE KEY `uk_user_badges_user_badge` (`userId`,`badgeId`),
  KEY `FK_badge_catalog_TO_user_badges_1` (`badgeId`),
  CONSTRAINT `FK_badge_catalog_TO_user_badges_1` FOREIGN KEY (`badgeId`) REFERENCES `badge_catalog` (`badgeId`),
  CONSTRAINT `FK_users_TO_user_badges_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_blocks` (
  `userBlockId` bigint NOT NULL AUTO_INCREMENT,
  `blockerUserId` bigint NOT NULL,
  `blockedUserId` bigint NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userBlockId`),
  UNIQUE KEY `UK_user_blocks_blocker_blocked` (`blockerUserId`,`blockedUserId`),
  KEY `IDX_user_blocks_blocked_blocker` (`blockedUserId`,`blockerUserId`),
  CONSTRAINT `FK_users_TO_user_blocks_1` FOREIGN KEY (`blockerUserId`) REFERENCES `users` (`userId`),
  CONSTRAINT `FK_users_TO_user_blocks_2` FOREIGN KEY (`blockedUserId`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_user_blocks_distinct_users` CHECK ((`blockerUserId` <> `blockedUserId`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_consents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_consents` (
  `userConsentId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `consentTypeId` bigint NOT NULL,
  `consented` tinyint(1) NOT NULL,
  `consentedAt` datetime DEFAULT NULL,
  `withdrawnAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userConsentId`),
  UNIQUE KEY `UK_USER_CONSENT_USER_TYPE` (`userId`,`consentTypeId`),
  KEY `FK_consent_types_TO_user_consents_1` (`consentTypeId`),
  CONSTRAINT `FK_consent_types_TO_user_consents_1` FOREIGN KEY (`consentTypeId`) REFERENCES `consent_types` (`consentTypeId`),
  CONSTRAINT `FK_users_TO_user_consents_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_face_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_face_tags` (
  `userFaceTagId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `faceTagId` bigint NOT NULL,
  `relativeScore` decimal(8,6) DEFAULT NULL,
  `rankOrder` smallint NOT NULL,
  `analyzedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `faceAnalysisResultId` bigint DEFAULT NULL,
  PRIMARY KEY (`userFaceTagId`),
  UNIQUE KEY `UK_user_face_tags_user_face_tag` (`userId`,`faceTagId`),
  UNIQUE KEY `UK_user_face_tags_user_rank` (`userId`,`rankOrder`),
  KEY `FK_face_tag_catalog_TO_user_face_tags_1` (`faceTagId`),
  KEY `FK_face_analysis_results_TO_user_face_tags` (`faceAnalysisResultId`),
  CONSTRAINT `FK_face_analysis_results_TO_user_face_tags` FOREIGN KEY (`faceAnalysisResultId`) REFERENCES `face_analysis_results` (`faceAnalysisResultId`),
  CONSTRAINT `FK_face_tag_catalog_TO_user_face_tags_1` FOREIGN KEY (`faceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
  CONSTRAINT `FK_users_TO_user_face_tags_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_user_face_tags_rank` CHECK ((`rankOrder` > 0)),
  CONSTRAINT `CK_user_face_tags_score` CHECK (((`relativeScore` is null) or ((`relativeScore` >= 0) and (`relativeScore` <= 1))))
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_love_temperatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_love_temperatures` (
  `userId` bigint NOT NULL,
  `currentTemperature` int NOT NULL DEFAULT '0',
  `completedSessionCount` int NOT NULL DEFAULT '0',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `FK_users_TO_user_love_temperatures_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_practice_goals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_practice_goals` (
  `userPracticeGoalId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `practiceGoalId` bigint DEFAULT NULL,
  `customGoal` varchar(255) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userPracticeGoalId`),
  KEY `FK_users_TO_user_practice_goals_1` (`userId`),
  KEY `FK_practice_goal_catalog_TO_user_practice_goals_1` (`practiceGoalId`),
  CONSTRAINT `FK_practice_goal_catalog_TO_user_practice_goals_1` FOREIGN KEY (`practiceGoalId`) REFERENCES `practice_goal_catalog` (`practiceGoalId`),
  CONSTRAINT `FK_users_TO_user_practice_goals_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_preferred_age_ranges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_preferred_age_ranges` (
  `userId` bigint NOT NULL,
  `minPreferredAge` smallint NOT NULL,
  `maxPreferredAge` smallint NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `FK_users_TO_user_preferred_age_ranges` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_user_preferred_age_ranges` CHECK (((`minPreferredAge` > 0) and (`maxPreferredAge` >= `minPreferredAge`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_preferred_face_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_preferred_face_tags` (
  `userPreferredFaceTagId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `faceTagId` bigint NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userPreferredFaceTagId`),
  UNIQUE KEY `UK_user_preferred_face_tags_user` (`userId`),
  KEY `FK_face_tag_catalog_TO_user_preferred_face_tags` (`faceTagId`),
  CONSTRAINT `FK_face_tag_catalog_TO_user_preferred_face_tags` FOREIGN KEY (`faceTagId`) REFERENCES `face_tag_catalog` (`face_tag_id`),
  CONSTRAINT `FK_users_TO_user_preferred_face_tags` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_preferred_traits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_preferred_traits` (
  `userPreferredTraitId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `traitId` bigint NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userPreferredTraitId`),
  UNIQUE KEY `UK_user_preferred_traits` (`userId`,`traitId`),
  KEY `FK_trait_catalog_TO_user_preferred_traits` (`traitId`),
  CONSTRAINT `FK_trait_catalog_TO_user_preferred_traits` FOREIGN KEY (`traitId`) REFERENCES `trait_catalog` (`traitId`),
  CONSTRAINT `FK_users_TO_user_preferred_traits` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profiles` (
  `userId` bigint NOT NULL,
  `nickname` varchar(30) NOT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `regionCity` varchar(50) DEFAULT NULL,
  `onboardingCompleted` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `UK_user_profiles_nickname` (`nickname`),
  CONSTRAINT `FK_users_TO_user_profiles_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_temperatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_temperatures` (
  `userId` bigint NOT NULL,
  `temperature` decimal(5,2) NOT NULL DEFAULT '36.50',
  `policyVersion` varchar(50) NOT NULL,
  `version` bigint NOT NULL DEFAULT '0',
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`userId`),
  CONSTRAINT `fk_user_temperatures_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`),
  CONSTRAINT `ck_user_temperatures_range` CHECK ((`temperature` between 20.00 and 50.00))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_traits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_traits` (
  `userTraitId` bigint NOT NULL AUTO_INCREMENT,
  `userId` bigint NOT NULL,
  `traitId` bigint NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userTraitId`),
  UNIQUE KEY `UK_user_traits_user_trait` (`userId`,`traitId`),
  KEY `FK_trait_catalog_TO_user_traits_1` (`traitId`),
  CONSTRAINT `FK_trait_catalog_TO_user_traits_1` FOREIGN KEY (`traitId`) REFERENCES `trait_catalog` (`traitId`),
  CONSTRAINT `FK_users_TO_user_traits_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `userId` bigint NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `passwordHash` varchar(255) DEFAULT NULL,
  `realName` varchar(50) NOT NULL,
  `phoneNumber` varchar(30) DEFAULT NULL,
  `birthDate` date DEFAULT NULL,
  `accountStatus` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `role` varchar(20) NOT NULL DEFAULT 'USER',
  `adultVerifiedAt` datetime DEFAULT NULL,
  `lastLoginAt` datetime DEFAULT NULL,
  `withdrawnAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `voice_session_analyses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `voice_session_analyses` (
  `voice_analysis_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `schema_version` int NOT NULL,
  `analysis_version` varchar(128) NOT NULL,
  `session_duration_ms` bigint NOT NULL,
  `analyzed_at` datetime(6) NOT NULL,
  `metrics_json` longtext NOT NULL,
  `payload_hash` varchar(64) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  PRIMARY KEY (`voice_analysis_id`),
  UNIQUE KEY `UK_voice_analysis_version` (`session_id`,`user_id`,`analysis_version`),
  KEY `FK_users_TO_voice_session_analyses` (`user_id`),
  KEY `IDX_voice_analysis_session_user` (`session_id`,`user_id`),
  CONSTRAINT `FK_sessions_TO_voice_session_analyses` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_voice_session_analyses` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_voice_analysis_duration` CHECK ((`session_duration_ms` > 0)),
  CONSTRAINT `CK_voice_analysis_schema_version` CHECK ((`schema_version` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `voice_session_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `voice_session_reports` (
  `voice_report_id` bigint NOT NULL AUTO_INCREMENT,
  `session_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `schema_version` int NOT NULL,
  `analysis_version` varchar(128) NOT NULL,
  `report_version` varchar(128) NOT NULL,
  `report_status` varchar(20) NOT NULL,
  `generation_mode` varchar(20) NOT NULL,
  `headline` varchar(1000) DEFAULT NULL,
  `notes_json` longtext NOT NULL,
  `next_mission` varchar(1000) DEFAULT NULL,
  `payload_hash` varchar(64) NOT NULL,
  `generated_at` datetime(6) NOT NULL,
  `received_at` datetime(6) NOT NULL,
  PRIMARY KEY (`voice_report_id`),
  UNIQUE KEY `UK_voice_report_version` (`session_id`,`user_id`,`report_version`),
  KEY `FK_users_TO_voice_session_reports` (`user_id`),
  KEY `IDX_voice_report_session_user` (`session_id`,`user_id`),
  CONSTRAINT `FK_sessions_TO_voice_session_reports` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`sessionId`),
  CONSTRAINT `FK_users_TO_voice_session_reports` FOREIGN KEY (`user_id`) REFERENCES `users` (`userId`),
  CONSTRAINT `CK_voice_report_schema_version` CHECK ((`schema_version` > 0)),
  CONSTRAINT `CK_voice_report_status` CHECK ((`report_status` in (_utf8mb4'COMPLETED',_utf8mb4'FALLBACK',_utf8mb4'FAILED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
