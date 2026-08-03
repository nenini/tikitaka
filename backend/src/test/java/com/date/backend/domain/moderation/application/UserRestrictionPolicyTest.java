package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.repository.AttendancePenaltyRepository;
import com.date.backend.domain.moderation.repository.UserSanctionRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserRestrictionPolicyTest {
	@Test
	void activeRestrictionBlocksProtectedOperation() {
		var sanctions = mock(UserSanctionRepository.class);
		var penalties = mock(AttendancePenaltyRepository.class);
		when(sanctions.existsActiveByUserId(eq(1L), any())).thenReturn(true);
		var policy = new UserRestrictionPolicy(sanctions, penalties,
				Clock.fixed(Instant.parse("2026-08-03T10:00:00Z"), ZoneId.of("Asia/Seoul")));
		assertThatThrownBy(() -> policy.assertNotRestricted(1L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ModerationErrorCode.USER_RESTRICTED));
	}
}
