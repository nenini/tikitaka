package com.date.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:flyway-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class FlywayMigrationTests {

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void migrationsCreateSchemaAndHistory() {
		Integer migrationCount = jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM \"flyway_schema_history\" "
				+ "WHERE \"success\" = TRUE AND \"version\" IS NOT NULL",
			Integer.class
		);
		Integer userTableCount = tableCount("USERS");
		Integer passwordResetTableCount = tableCount("PASSWORD_RESET_TOKENS");
		Integer profileTableCount = tableCount("USER_PROFILES");
		Integer contactProfileTableCount = tableCount("CONTACT_PROFILES");
		Integer activeConsentTypeCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM CONSENT_TYPES WHERE ISACTIVE = TRUE",
				Integer.class
		);
		Integer preferredAgeRangeTableCount = tableCount("USER_PREFERRED_AGE_RANGES");
		Integer preferredFaceTagTableCount = tableCount("USER_PREFERRED_FACE_TAGS");
		Integer preferredTraitTableCount = tableCount("USER_PREFERRED_TRAITS");
		Integer faceAnalysisRequestTableCount = tableCount("FACE_ANALYSIS_REQUESTS");
		Integer faceAnalysisResultTableCount = tableCount("FACE_ANALYSIS_RESULTS");
		Integer faceAnalysisResultTagTableCount = tableCount("FACE_ANALYSIS_RESULT_TAGS");
		Integer aiChatPurposeColumnCount = columnCount("CHATBOT_CONVERSATIONS", "PURPOSE");
		Integer aiChatMessageSequenceColumnCount = columnCount("CHATBOT_MESSAGES", "SEQUENCENO");
		Integer aiPersonaKeyColumnCount = columnCount("CHATBOT_CONVERSATIONS", "AIPERSONAKEY");
		Integer aiResponseStateColumnCount = columnCount("CHATBOT_CONVERSATIONS", "AIRESPONSESTATE");
		Integer pendingUserMessageColumnCount = columnCount("CHATBOT_CONVERSATIONS", "PENDINGUSERMESSAGEID");
		Integer liveKitRoomNameColumnCount = columnCount("SESSIONS", "LIVEKITROOMNAME");
		Integer roomDeviceCheckTableCount = tableCount("ROOM_DEVICE_CHECKS");
		Integer activeMatchRequestTableCount = tableCount("ACTIVE_MATCH_REQUESTS");
		Integer matchRequestSlotTableCount = tableCount("MATCH_REQUEST_SLOTS");
		Integer matchRequestTraitSnapshotTableCount =
				tableCount("MATCH_REQUEST_TRAIT_SNAPSHOTS");
		Integer matchJobTableCount = tableCount("MATCH_JOBS");
		Integer notificationTableCount = tableCount("NOTIFICATIONS");
		Integer notificationJobTableCount = tableCount("NOTIFICATION_JOBS");
		Integer notificationPresentationColumnCount = columnCount(
				"NOTIFICATIONS",
				"PRESENTATION"
		);
		Integer notificationDeduplicationKeyColumnCount = columnCount(
				"NOTIFICATIONS",
				"DEDUPLICATIONKEY"
		);
		Integer notificationMigrationCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM \"flyway_schema_history\" "
						+ "WHERE \"success\" = TRUE AND \"version\" = '15'",
				Integer.class
		);
		Integer matchPolicyMigrationCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM \"flyway_schema_history\" "
						+ "WHERE \"success\" = TRUE AND \"version\" = '16'",
				Integer.class
		);
		Integer notificationQueryMigrationCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM \"flyway_schema_history\" "
						+ "WHERE \"success\" = TRUE AND \"version\" = '17'",
				Integer.class
		);
		Integer waitingRecommendationMigrationCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM \"flyway_schema_history\" "
						+ "WHERE \"success\" = TRUE AND \"version\" = '18'",
				Integer.class
		);
		Integer adminMatchingPolicyMigrationCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM \"flyway_schema_history\" "
						+ "WHERE \"success\" = TRUE AND \"version\" = '20'",
				Integer.class
		);
		Integer matchingPolicyTableCount = tableCount("MATCHING_POLICIES");
		Integer proposedScheduledAtColumnCount = columnCount(
				"MATCH_PAIRS",
				"PROPOSEDSCHEDULEDAT"
		);
		Integer rejectedAtColumnCount = columnCount(
				"MATCH_REQUESTS",
				"REJECTEDAT"
		);
		Integer matchWaitingStartedAtColumnCount = columnCount(
				"MATCH_REQUESTS",
				"WAITINGSTARTEDAT"
		);
		Integer settingRecommendationSentAtColumnCount = columnCount(
				"MATCH_REQUESTS",
				"SETTINGRECOMMENDATIONSENTAT"
		);
		Integer faceTagCount = rowCount("face_tag_catalog");
		Integer aiFaceTagCodeCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM `face_tag_catalog` "
						+ "WHERE `code` IN ("
						+ "'DOG', 'CAT', 'RABBIT', 'FOX', 'DEER', "
						+ "'TURTLE', 'HAMSTER', 'SNAKE', 'DINOSAUR', 'WOLF'"
						+ ")",
				Integer.class
		);
		Integer legacyFaceTagCodeCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM `face_tag_catalog` WHERE `code` LIKE '%_FACE'",
				Integer.class
		);
		String turtleFaceName = jdbcTemplate.queryForObject(
				"SELECT `name` FROM `face_tag_catalog` WHERE `code` = 'TURTLE'",
				String.class
		);
		Integer personalityCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM `trait_catalog` WHERE `traitType` = 'PERSONALITY'",
				Integer.class
		);
		Integer practiceGoalCount = rowCount("practice_goal_catalog");

		assertThat(migrationCount).isEqualTo(21);
		assertThat(userTableCount).isEqualTo(1);
		assertThat(passwordResetTableCount).isEqualTo(1);
		assertThat(profileTableCount).isEqualTo(1);
		assertThat(contactProfileTableCount).isZero();

		assertThat(activeConsentTypeCount).isEqualTo(2);

		assertThat(preferredAgeRangeTableCount).isEqualTo(1);
		assertThat(preferredFaceTagTableCount).isEqualTo(1);
		assertThat(preferredTraitTableCount).isEqualTo(1);
		assertThat(faceAnalysisRequestTableCount).isEqualTo(1);
		assertThat(faceAnalysisResultTableCount).isEqualTo(1);
		assertThat(faceAnalysisResultTagTableCount).isEqualTo(1);
		assertThat(aiChatPurposeColumnCount).isEqualTo(1);
		assertThat(aiChatMessageSequenceColumnCount).isEqualTo(1);
		assertThat(aiPersonaKeyColumnCount).isEqualTo(1);
		assertThat(aiResponseStateColumnCount).isEqualTo(1);
		assertThat(pendingUserMessageColumnCount).isEqualTo(1);
		assertThat(liveKitRoomNameColumnCount).isEqualTo(1);
		assertThat(roomDeviceCheckTableCount).isEqualTo(1);
		assertThat(activeMatchRequestTableCount).isEqualTo(1);
		assertThat(matchRequestSlotTableCount).isEqualTo(1);
		assertThat(matchRequestTraitSnapshotTableCount).isEqualTo(1);
		assertThat(matchJobTableCount).isEqualTo(1);
		assertThat(notificationTableCount).isEqualTo(1);
		assertThat(notificationJobTableCount).isEqualTo(1);
		assertThat(notificationPresentationColumnCount).isEqualTo(1);
		assertThat(notificationDeduplicationKeyColumnCount).isEqualTo(1);
		assertThat(notificationMigrationCount).isEqualTo(1);
		assertThat(matchPolicyMigrationCount).isEqualTo(1);
		assertThat(notificationQueryMigrationCount).isEqualTo(1);
		assertThat(waitingRecommendationMigrationCount).isEqualTo(1);
		assertThat(adminMatchingPolicyMigrationCount).isEqualTo(1);
		assertThat(matchingPolicyTableCount).isEqualTo(1);
		assertThat(proposedScheduledAtColumnCount).isEqualTo(1);
		assertThat(rejectedAtColumnCount).isEqualTo(1);
		assertThat(matchWaitingStartedAtColumnCount).isEqualTo(1);
		assertThat(settingRecommendationSentAtColumnCount).isEqualTo(1);
		assertThat(faceTagCount).isEqualTo(10);
		assertThat(aiFaceTagCodeCount).isEqualTo(10);
		assertThat(legacyFaceTagCodeCount).isZero();
		assertThat(turtleFaceName).isEqualTo("꼬북이상");
		assertThat(personalityCount).isEqualTo(11);
		assertThat(practiceGoalCount).isEqualTo(5);
	}

	private Integer tableCount(String tableName) {
		return jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
				+ "WHERE TABLE_SCHEMA = 'PUBLIC' "
				+ "AND TABLE_NAME = ?",
			Integer.class,
			tableName
		);
	}

	private Integer rowCount(String tableName) {
		return jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM `" + tableName + "`",
				Integer.class
		);
	}

	private Integer columnCount(String tableName, String columnName) {
		return jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
						+ "WHERE TABLE_SCHEMA = 'PUBLIC' "
						+ "AND TABLE_NAME = ? "
						+ "AND COLUMN_NAME = ?",
				Integer.class,
				tableName,
				columnName
		);
	}
}
