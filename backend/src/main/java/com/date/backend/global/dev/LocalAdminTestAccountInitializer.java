package com.date.backend.global.dev;

import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("local")
@ConditionalOnProperty(
		prefix = "app.local-seed",
		name = "admin-test-user-enabled",
		havingValue = "true",
		matchIfMissing = true
)
public class LocalAdminTestAccountInitializer implements ApplicationRunner {

	private static final Logger log =
			LoggerFactory.getLogger(LocalAdminTestAccountInitializer.class);

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final String adminEmail;
	private final String adminPassword;

	public LocalAdminTestAccountInitializer(
			UserRepository userRepository,
			PasswordEncoder passwordEncoder,
			@Value("${app.local-seed.admin-email:admin@example.com}")
			String adminEmail,
			@Value("${app.local-seed.admin-password:qwer1234@}")
			String adminPassword
	) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.adminEmail = adminEmail;
		this.adminPassword = adminPassword;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		User admin = userRepository.findByEmail(adminEmail)
				.orElseGet(() -> new User(
						adminEmail,
						null,
						"로컬 관리자",
						null,
						null
				));
		admin.changePassword(passwordEncoder.encode(adminPassword));
		admin.promoteToAdmin();
		userRepository.save(admin);

		log.info("Local admin test account is ready. email={}", adminEmail);
	}
}
