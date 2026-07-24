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

		assertThat(migrationCount).isEqualTo(6);
		assertThat(userTableCount).isEqualTo(1);
		assertThat(passwordResetTableCount).isEqualTo(1);
		assertThat(profileTableCount).isEqualTo(1);
		assertThat(contactProfileTableCount).isZero();
		assertThat(activeConsentTypeCount).isEqualTo(2);
	}

	private Integer tableCount(String tableName) {
		return jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
						+ "WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = ?",
				Integer.class,
				tableName
		);
	}
}
