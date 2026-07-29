package com.date.backend.global.dev;

import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LocalAdminTestAccountInitializerTest {

	@Mock
	private UserRepository userRepository;

	@Mock
	private PasswordEncoder passwordEncoder;

	@Test
	void createsLocalAdminWhenAccountDoesNotExist() {
		String email = "admin@example.com";
		String password = "qwer1234@";
		when(userRepository.findByEmail(email)).thenReturn(Optional.empty());
		when(passwordEncoder.encode(password)).thenReturn("encoded-password");
		LocalAdminTestAccountInitializer initializer =
				new LocalAdminTestAccountInitializer(
						userRepository,
						passwordEncoder,
						email,
						password
				);

		initializer.run(null);

		ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
		verify(userRepository).save(captor.capture());
		User admin = captor.getValue();
		assertThat(admin.getEmail()).isEqualTo(email);
		assertThat(admin.getPasswordHash()).isEqualTo("encoded-password");
		assertThat(admin.getRole()).isEqualTo(UserRole.ADMIN);
	}

	@Test
	void updatesExistingAccountAsLocalAdmin() {
		String email = "admin@example.com";
		String password = "new-password";
		User existing = new User(
				email,
				"old-password",
				"관리자",
				null,
				LocalDate.of(2000, 1, 1)
		);
		when(userRepository.findByEmail(email)).thenReturn(Optional.of(existing));
		when(passwordEncoder.encode(password)).thenReturn("new-encoded-password");
		LocalAdminTestAccountInitializer initializer =
				new LocalAdminTestAccountInitializer(
						userRepository,
						passwordEncoder,
						email,
						password
				);

		initializer.run(null);

		verify(userRepository).save(existing);
		assertThat(existing.getPasswordHash()).isEqualTo("new-encoded-password");
		assertThat(existing.getRole()).isEqualTo(UserRole.ADMIN);
	}
}
