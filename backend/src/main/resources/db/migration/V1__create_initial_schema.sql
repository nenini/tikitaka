CREATE TABLE `chatbot_messages` (
	`chatbotMessageId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`chatbotConversationId`	BIGINT	NOT NULL,
	`senderType`	VARCHAR(20)	NOT NULL,
	`messageText`	TEXT	NOT NULL,
	`isProactive`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `face_tag_examples` (
	`faceTagExampleId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`faceTagId`	BIGINT	NOT NULL,
	`celebrityName`	VARCHAR(100)	NOT NULL,
	`displayOrder`	SMALLINT	NOT NULL	DEFAULT 1,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE
);

CREATE TABLE `chatbot_conversations` (
	`chatbotConversationId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`chatbotPersonaId`	BIGINT	NOT NULL,
	`conversationStage`	VARCHAR(20)	NOT NULL,
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'ACTIVE',
	`lastUserMessageAt`	DATETIME	NULL,
	`proactiveMessageSentAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`closedAt`	DATETIME	NULL
);

CREATE TABLE `contact_exchange_requests` (
	`contactExchangeRequestId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NOT NULL,
	`requesterUserId`	BIGINT	NOT NULL,
	`targetUserId`	BIGINT	NOT NULL,
	`requesterAgreed`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`targetAgreed`	BOOLEAN	NULL,
	`status`	VARCHAR(20)	NOT NULL,
	`extensionAgreed`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`requestedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`respondedAt`	DATETIME	NULL,
	`disclosedAt`	DATETIME	NULL
);

CREATE TABLE `match_responses` (
	`match_response_id`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`match_pair_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`response`	VARCHAR(20)	NOT NULL,
	`responded_at`	DATETIME	NULL
);

CREATE TABLE `user_availability_slots` (
	`availabilitySlotId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`dayOfWeek`	TINYINT	NOT NULL,
	`startTime`	TIME	NOT NULL,
	`endTime`	TIME	NOT NULL,
	`timezone`	VARCHAR(50)	NOT NULL	DEFAULT 'Asia/Seoul',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_traits` (
	`userTraitId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`traitId`	BIGINT	NOT NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `match_pairs` (
	`matchPairId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`requesterAId`	BIGINT	NOT NULL,
	`requesterBId`	BIGINT	NOT NULL,
	`userAId`	BIGINT	NOT NULL,
	`userBId`	BIGINT	NOT NULL,
	`totalScore`	DECIMAL(6, 3)	NULL,
	`goalScore`	DECIMAL(6, 3)	NULL,
	`conversationScore`	DECIMAL(6, 3)	NULL,
	`scheduleScore`	DECIMAL(6, 3)	NULL,
	`preferenceScore`	DECIMAL(6, 3)	NULL,
	`status`	VARCHAR(20)	NOT NULL,
	`acceptDeadlineAt`	DATETIME	NULL,
	`matchedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `safety_events` (
	`safetyEventId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NOT NULL,
	`userId`	BIGINT	NOT NULL,
	`category`	VARCHAR(50)	NOT NULL,
	`severity`	VARCHAR(20)	NOT NULL,
	`sourceType`	VARCHAR(20)	NOT NULL,
	`eventTimeSec`	INT	NOT NULL,
	`contextSummary`	VARCHAR(1000)	NULL,
	`evidenceExcerpt`	TEXT	NULL,
	`alternativeExpression`	VARCHAR(1000)	NULL,
	`temperaturePenalty`	DECIMAL(6, 2)	NOT NULL	DEFAULT 0,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `room_themes` (
	`room_theme_id`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`name`	VARCHAR(100)	NOT NULL,
	`placeType`	VARCHAR(30)	NOT NULL,
	`backgroundUrl`	VARCHAR(1000)	NULL,
	`ambienceAudioUrl`	VARCHAR(1000)	NULL,
	`startTime`	TIME	NULL,
	`endTime`	TIME	NULL,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE
);

CREATE TABLE `session_goals` (
	`session_goal_id`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`session_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`practice_goal_id`	BIGINT	NULL,
	`custom_goal`	VARCHAR(255)	NULL
);

CREATE TABLE `session_reports` (
	`sessionReportId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NOT NULL,
	`userId`	BIGINT	NOT NULL,
	`reportStatus`	VARCHAR(20)	NOT NULL,
	`aiFlowScore`	DECIMAL(5, 2)	NULL,
	`aiQuestionScore`	DECIMAL(5, 2)	NULL,
	`aiListeningScore`	DECIMAL(5, 2)	NULL,
	`aiReactionScore`	DECIMAL(5, 2)	NULL,
	`aiMannerScore`	DECIMAL(5, 2)	NULL,
	`aiNonverbalScore`	DECIMAL(5, 2)	NULL,
	`peerAverageScore`	DECIMAL(5, 2)	NULL,
	`strengthsJson`	JSON	NULL,
	`improvementsJson`	JSON	NULL,
	`nextMissionsJson`	JSON	NULL,
	`topicSummaryJson`	JSON	NULL,
	`summaryText`	TEXT	NULL,
	`generatedAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_badges` (
	`userBadgeId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`badgeId`	BIGINT	NOT NULL,
	`awardedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`isDisplayed`	Boolean	NOT NULL	DEFAULT 0
);

CREATE TABLE `notifications` (
	`notificationId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`notificationType`	VARCHAR(50)	NOT NULL,
	`title`	VARCHAR(200)	NOT NULL,
	`content`	VARCHAR(1000)	NOT NULL,
	`relatedType`	VARCHAR(30)	NULL,
	`relatedId`	BIGINT	NULL,
	`isRead`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`sentAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`readAt`	DATETIME	NULL
);

CREATE TABLE `peer_evaluations` (
	`peerEvaluationId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NOT NULL,
	`evaluatorUserId`	BIGINT	NOT NULL,
	`evaluateeUserId`	BIGINT	NOT NULL,
	`comfortScore`	TINYINT	NOT NULL,
	`questionConnectionScore`	TINYINT	NOT NULL,
	`listeningScore`	TINYINT	NOT NULL,
	`reactionScore`	TINYINT	NOT NULL,
	`balanceScore`	TINYINT	NOT NULL,
	`mannerScore`	TINYINT	NOT NULL,
	`goodBehaviorText`	VARCHAR(1000)	NULL,
	`improvementText`	VARCHAR(1000)	NULL,
	`submittedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `refresh_tokens` (
	`refreshTokenId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`tokenHash`	VARCHAR(255)	NOT NULL,
	`expiresAt`	DATETIME	NOT NULL,
	`revokedAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`lastUsedAt`	DATETIME	NULL
);

CREATE TABLE `user_consents` (
	`userConsentId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`consentTypeId`	BIGINT	NOT NULL,
	`consented`	BOOLEAN	NOT NULL,
	`consentedAt`	DATETIME	NULL,
	`withdrawnAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `oauth_accounts` (
	`oauthAccountId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`provider`	VARCHAR(20)	NOT NULL,
	`providerUserId`	VARCHAR(255)	NOT NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `reports` (
	`reportId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NULL,
	`reporterUserId`	BIGINT	NOT NULL,
	`reportedUserId`	BIGINT	NOT NULL,
	`reportType`	VARCHAR(50)	NOT NULL,
	`description`	VARCHAR(2000)	NULL,
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'RECEIVED',
	`reportedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`resolvedAt`	DATETIME	NULL
);

CREATE TABLE `users` (
	`userId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`email`	VARCHAR(255)	NOT NULL UNIQUE,
	`passwordHash`	VARCHAR(255)	NULL,
	`realName`	VARCHAR(50)	NOT NULL,
	`phoneNumber`	VARCHAR(30)	NULL,
	`birthDate`	DATE	NOT NULL,
	`accountStatus`	VARCHAR(20)	NOT NULL	DEFAULT 'ACTIVE',
	`role`	VARCHAR(20)	NOT NULL	DEFAULT 'USER',
	`adultVerifiedAt`	DATETIME	NULL,
	`lastLoginAt`	DATETIME	NULL,
	`withdrawnAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_love_temperatures` (
	`userId`	BIGINT	NOT NULL,
	`currentTemperature`	INT	NOT NULL	DEFAULT 0,
	`completedSessionCount`	INT	NOT NULL	DEFAULT 0,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `session_participants` (
	`session_participant_id`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`session_id`	BIGINT	NOT NULL,
	`user_id`	BIGINT	NOT NULL,
	`participant_role`	VARCHAR(10)	NOT NULL,
	`participation_status`	VARCHAR(20)	NOT NULL,
	`joined_at`	DATETIME	NULL,
	`left_at`	DATETIME	NULL,
	`expression_analysis_enabled`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`voice_analysis_enabled`	BOOLEAN	NOT NULL	DEFAULT FALSE
);

CREATE TABLE `sessions` (
	`sessionId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`matchPairId`	BIGINT	NULL,
	`roomThemeId`	BIGINT	NULL,
	`sessionType`	VARCHAR(20)	NOT NULL,
	`status`	VARCHAR(30)	NOT NULL,
	`scheduledStartAt`	DATETIME	NOT NULL,
	`actualStartAt`	DATETIME	NULL,
	`actualEndAt`	DATETIME	NULL,
	`plannedDurationSec`	INT	NOT NULL	DEFAULT 1800,
	`extensionDurationSec`	INT	NOT NULL	DEFAULT 0,
	`terminationReason`	VARCHAR(500)	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `consent_types` (
	`consentTypeId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`code`	VARCHAR(50)	NOT NULL,
	`name`	VARCHAR(100)	NOT NULL,
	`version`	VARCHAR(20)	NOT NULL,
	`isRequired`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `face_tag_catalog` (
	`face_tag_id`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`code`	VARCHAR(50)	NOT NULL,
	`name`	VARCHAR(50)	NOT NULL,
	`description`	VARCHAR(500)	NULL,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `chatbot_personas` (
	`chatbotPersonaId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`name`	VARCHAR(100)	NOT NULL,
	`speechStyle`	VARCHAR(100)	NOT NULL,
	`difficulty`	VARCHAR(20)	NOT NULL,
	`personality`	VARCHAR(30)	NOT NULL,
	`reactionLevel`	VARCHAR(20)	NOT NULL,
	`systemPrompt`	TEXT	NOT NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `session_metric_summaries` (
	`sessionMetricSummaryId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NOT NULL,
	`userId`	BIGINT	NOT NULL,
	`speakingRatio`	DECIMAL(5, 2)	NULL,
	`questionCount`	INT	NOT NULL	DEFAULT 0,
	`followupQuestionCount`	INT	NOT NULL	DEFAULT 0,
	`interruptionCount`	INT	NOT NULL	DEFAULT 0,
	`overlapCount`	INT	NOT NULL	DEFAULT 0,
	`averageUtteranceSec`	DECIMAL(8, 2)	NULL,
	`silenceTotalSec`	INT	NOT NULL	DEFAULT 0,
	`fillerWordCount`	INT	NOT NULL	DEFAULT 0,
	`speakingSpeedWpm`	DECIMAL(8, 2)	NULL,
	`gazeRatio`	DECIMAL(5, 2)	NULL,
	`smileRatio`	DECIMAL(5, 2)	NULL,
	`nodCount`	INT	NOT NULL	DEFAULT 0,
	`faceAbsenceSec`	INT	NOT NULL	DEFAULT 0,
	`negativeExpressionCount`	INT	NOT NULL	DEFAULT 0,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `badge_catalog` (
	`badgeId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`code`	VARCHAR(50)	NOT NULL,
	`name`	VARCHAR(100)	NOT NULL,
	`description`	VARCHAR(500)	NULL,
	`conditionType`	VARCHAR(500)	NULL,
	`thresholdCount`	INT	NULL,
	`iconUrl`	VARCHAR(100)	NULL,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`updatedAt`	DATETIME	NULL,
	`displayOrder`	INT	NULL
);

CREATE TABLE `trait_catalog` (
	`traitId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`traitType`	VARCHAR(30)	NOT NULL,
	`code`	VARCHAR(50)	NOT NULL,
	`name`	VARCHAR(50)	NOT NULL,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE
);

CREATE TABLE `practice_goal_catalog` (
	`practiceGoalId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`code`	VARCHAR(50)	NOT NULL,
	`name`	VARCHAR(100)	NOT NULL,
	`description`	VARCHAR(500)	NULL,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE
);

CREATE TABLE `match_requests` (
	`matchRequestId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`status`	VARCHAR(20)	NOT NULL,
	`preferredStartAt`	DATETIME	NULL,
	`preferredEndAt`	DATETIME	NULL,
	`requestedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`cancelledAt`	DATETIME	NULL
);

CREATE TABLE `coaching_events` (
	`coachingEventId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`sessionId`	BIGINT	NOT NULL,
	`targetUserId`	BIGINT	NOT NULL,
	`eventType`	VARCHAR(40)	NOT NULL,
	`severity`	VARCHAR(20)	NOT NULL	DEFAULT 'INFO',
	`eventTimeSec`	INT	NOT NULL,
	`message`	VARCHAR(500)	NOT NULL,
	`displayedAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`feedbackType`	Boolean	NULL
);

CREATE TABLE `contact_profiles` (
	`userId`	BIGINT	NOT NULL,
	`instagraId`	VARCHAR(100)	NULL,
	`kakaoId`	VARCHAR(100)	NULL,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `attendance_penalties` (
	`attendancePenaltyId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`sessionId`	BIGINT	NULL,
	`penaltyType`	VARCHAR(20)	NOT NULL,
	`temperatureDelta`	INT	NOT NULL	DEFAULT 0,
	`noShowCountDelta`	INT	NOT NULL	DEFAULT 0,
	`expiresAt`	DATETIME	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_profiles` (
	`userId`	BIGINT	NOT NULL,
	`nickname`	VARCHAR(30)	NOT NULL,
	`gender`	VARCHAR(20)	NULL,
	`heightCm`	SMALLINT	NULL,
	`regionCity`	VARCHAR(50)	NULL,
	`regionDistrict`	VARCHAR(50)	NULL,
	`minPreferredAge`	SMALLINT	NULL,
	`maxPreferredAge`	SMALLINT	NULL,
	`conversationType`	VARCHAR(20)	NULL,
	`faceTagsVisible`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`onboardingCompleted`	BOOLEAN	NOT NULL	DEFAULT FALSE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP,
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_practice_goals` (
	`userPracticeGoalId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`practiceGoalId`	BIGINT	NULL,
	`customGoal`	VARCHAR(255)	NULL,
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_face_tags` (
	`userFaceTagId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`faceTagId`	BIGINT	NOT NULL,
	`confidenceScore`	DECIMAL(5, 4)	NULL,
	`rankOrder`	SMALLINT	NOT NULL,
	`analyzedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_blocks` (
	`userBlockId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`blockerUserId`	BIGINT	NOT NULL,
	`blockedUserId`	BIGINT	NOT NULL,
	`reason`	VARCHAR(500)	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `love_temperature_histories` (
	`loveTemperatureHistoryId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`sessionId`	BIGINT	NULL,
	`changeType`	VARCHAR(30)	NOT NULL,
	`temperatureDelta`	INT	NOT NULL	DEFAULT 0,
	`temperatureBefore`	INT	NOT NULL,
	`temperatureAfter`	INT	NOT NULL,
	`reason`	VARCHAR(500)	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `sanctions` (
	`sanctionId`	BIGINT	NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`userId`	BIGINT	NOT NULL,
	`reportId`	BIGINT	NULL,
	`sanctionType`	VARCHAR(30)	NOT NULL,
	`reason`	VARCHAR(1000)	NOT NULL,
	`startsAt`	DATETIME	NOT NULL,
	`endsAt`	DATETIME	NULL,
	`createdBy`	BIGINT	NULL,
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);





















ALTER TABLE `user_love_temperatures` ADD CONSTRAINT `PK_USER_LOVE_TEMPERATURES` PRIMARY KEY (
	`userId`
);












ALTER TABLE `contact_profiles` ADD CONSTRAINT `PK_CONTACT_PROFILES` PRIMARY KEY (
	`userId`
);


ALTER TABLE `user_profiles` ADD CONSTRAINT `PK_USER_PROFILES` PRIMARY KEY (
	`userId`
);






ALTER TABLE `chatbot_messages` ADD CONSTRAINT `FK_chatbot_conversations_TO_chatbot_messages_1` FOREIGN KEY (
	`chatbotConversationId`
)
REFERENCES `chatbot_conversations` (
	`chatbotConversationId`
);

ALTER TABLE `face_tag_examples` ADD CONSTRAINT `FK_face_tag_catalog_TO_face_tag_examples_1` FOREIGN KEY (
	`faceTagId`
)
REFERENCES `face_tag_catalog` (
	`face_tag_id`
);

ALTER TABLE `chatbot_conversations` ADD CONSTRAINT `FK_users_TO_chatbot_conversations_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `chatbot_conversations` ADD CONSTRAINT `FK_chatbot_personas_TO_chatbot_conversations_1` FOREIGN KEY (
	`chatbotPersonaId`
)
REFERENCES `chatbot_personas` (
	`chatbotPersonaId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `FK_sessions_TO_contact_exchange_requests_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `FK_users_TO_contact_exchange_requests_1` FOREIGN KEY (
	`requesterUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `FK_users_TO_contact_exchange_requests_2` FOREIGN KEY (
	`targetUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `match_responses` ADD CONSTRAINT `FK_match_pairs_TO_match_responses_1` FOREIGN KEY (
	`match_pair_id`
)
REFERENCES `match_pairs` (
	`matchPairId`
);

ALTER TABLE `match_responses` ADD CONSTRAINT `FK_users_TO_match_responses_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_availability_slots` ADD CONSTRAINT `FK_users_TO_user_availability_slots_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_traits` ADD CONSTRAINT `FK_users_TO_user_traits_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_traits` ADD CONSTRAINT `FK_trait_catalog_TO_user_traits_1` FOREIGN KEY (
	`traitId`
)
REFERENCES `trait_catalog` (
	`traitId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_match_requests_TO_match_pairs_1` FOREIGN KEY (
	`requesterAId`
)
REFERENCES `match_requests` (
	`matchRequestId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_match_requests_TO_match_pairs_2` FOREIGN KEY (
	`requesterBId`
)
REFERENCES `match_requests` (
	`matchRequestId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_users_TO_match_pairs_1` FOREIGN KEY (
	`userAId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_users_TO_match_pairs_2` FOREIGN KEY (
	`userBId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `safety_events` ADD CONSTRAINT `FK_sessions_TO_safety_events_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `safety_events` ADD CONSTRAINT `FK_users_TO_safety_events_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `FK_sessions_TO_session_goals_1` FOREIGN KEY (
	`session_id`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `FK_users_TO_session_goals_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `FK_practice_goal_catalog_TO_session_goals_1` FOREIGN KEY (
	`practice_goal_id`
)
REFERENCES `practice_goal_catalog` (
	`practiceGoalId`
);

ALTER TABLE `session_reports` ADD CONSTRAINT `FK_sessions_TO_session_reports_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_reports` ADD CONSTRAINT `FK_users_TO_session_reports_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_badges` ADD CONSTRAINT `FK_users_TO_user_badges_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_badges` ADD CONSTRAINT `FK_badge_catalog_TO_user_badges_1` FOREIGN KEY (
	`badgeId`
)
REFERENCES `badge_catalog` (
	`badgeId`
);

ALTER TABLE `notifications` ADD CONSTRAINT `FK_users_TO_notifications_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `FK_sessions_TO_peer_evaluations_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `FK_users_TO_peer_evaluations_1` FOREIGN KEY (
	`evaluatorUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `FK_users_TO_peer_evaluations_2` FOREIGN KEY (
	`evaluateeUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `refresh_tokens` ADD CONSTRAINT `FK_users_TO_refresh_tokens_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_consents` ADD CONSTRAINT `FK_users_TO_user_consents_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_consents` ADD CONSTRAINT `FK_consent_types_TO_user_consents_1` FOREIGN KEY (
	`consentTypeId`
)
REFERENCES `consent_types` (
	`consentTypeId`
);

ALTER TABLE `oauth_accounts` ADD CONSTRAINT `FK_users_TO_oauth_accounts_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `reports` ADD CONSTRAINT `FK_sessions_TO_reports_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `reports` ADD CONSTRAINT `FK_users_TO_reports_1` FOREIGN KEY (
	`reporterUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `reports` ADD CONSTRAINT `FK_users_TO_reports_2` FOREIGN KEY (
	`reportedUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_love_temperatures` ADD CONSTRAINT `FK_users_TO_user_love_temperatures_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `session_participants` ADD CONSTRAINT `FK_sessions_TO_session_participants_1` FOREIGN KEY (
	`session_id`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_participants` ADD CONSTRAINT `FK_users_TO_session_participants_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `sessions` ADD CONSTRAINT `FK_match_pairs_TO_sessions_1` FOREIGN KEY (
	`matchPairId`
)
REFERENCES `match_pairs` (
	`matchPairId`
);

ALTER TABLE `sessions` ADD CONSTRAINT `FK_room_themes_TO_sessions_1` FOREIGN KEY (
	`roomThemeId`
)
REFERENCES `room_themes` (
	`room_theme_id`
);

ALTER TABLE `session_metric_summaries` ADD CONSTRAINT `FK_sessions_TO_session_metric_summaries_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_metric_summaries` ADD CONSTRAINT `FK_users_TO_session_metric_summaries_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `match_requests` ADD CONSTRAINT `FK_users_TO_match_requests_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `coaching_events` ADD CONSTRAINT `FK_sessions_TO_coaching_events_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `coaching_events` ADD CONSTRAINT `FK_users_TO_coaching_events_1` FOREIGN KEY (
	`targetUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `contact_profiles` ADD CONSTRAINT `FK_users_TO_contact_profiles_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `attendance_penalties` ADD CONSTRAINT `FK_users_TO_attendance_penalties_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `attendance_penalties` ADD CONSTRAINT `FK_sessions_TO_attendance_penalties_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `user_profiles` ADD CONSTRAINT `FK_users_TO_user_profiles_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_practice_goals` ADD CONSTRAINT `FK_users_TO_user_practice_goals_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_practice_goals` ADD CONSTRAINT `FK_practice_goal_catalog_TO_user_practice_goals_1` FOREIGN KEY (
	`practiceGoalId`
)
REFERENCES `practice_goal_catalog` (
	`practiceGoalId`
);

ALTER TABLE `user_face_tags` ADD CONSTRAINT `FK_users_TO_user_face_tags_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_face_tags` ADD CONSTRAINT `FK_face_tag_catalog_TO_user_face_tags_1` FOREIGN KEY (
	`faceTagId`
)
REFERENCES `face_tag_catalog` (
	`face_tag_id`
);

ALTER TABLE `user_blocks` ADD CONSTRAINT `FK_users_TO_user_blocks_1` FOREIGN KEY (
	`blockerUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_blocks` ADD CONSTRAINT `FK_users_TO_user_blocks_2` FOREIGN KEY (
	`blockedUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `love_temperature_histories` ADD CONSTRAINT `FK_users_TO_love_temperature_histories_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `love_temperature_histories` ADD CONSTRAINT `FK_sessions_TO_love_temperature_histories_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `FK_users_TO_sanctions_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `FK_users_TO_sanctions_2` FOREIGN KEY (
	`createdBy`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `FK_reports_TO_sanctions_1` FOREIGN KEY (
	`reportId`
)
REFERENCES `reports` (
	`reportId`
);

