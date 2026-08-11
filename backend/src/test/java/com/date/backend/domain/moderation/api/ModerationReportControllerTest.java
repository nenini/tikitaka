package com.date.backend.domain.moderation.api;

import com.date.backend.domain.moderation.application.ModerationReportService;
import com.date.backend.domain.moderation.domain.ModerationReportReason;
import com.date.backend.domain.moderation.domain.ModerationReportStatus;
import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.dto.response.ModerationReportResponse;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.global.security.AuthUser;
import com.date.backend.domain.user.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ModerationReportControllerTest {
	@Test
	void delegatesAuthenticatedReporterAndRequest() {
		ModerationReportService service = mock(ModerationReportService.class);
		ModerationReportController controller =
				new ModerationReportController(service);
		AuthUser authUser = new AuthUser(
				1L,
				"reporter@example.com",
				UserRole.USER
		);
		ModerationReportCreateRequest request =
				new ModerationReportCreateRequest(
						15L,
						2L,
						ModerationReportReason.OTHER,
						"상세 내용"
				);
		ModerationReportResponse expected = new ModerationReportResponse(
				31L,
				15L,
				1L,
				2L,
				ModerationReportReason.OTHER,
				"상세 내용",
				ModerationReportStatus.RECEIVED,
				RoomSessionStatus.COMPLETED,
				LocalDateTime.of(2026, 8, 3, 14, 0),
				List.of()
		);
		when(service.create(1L, request)).thenReturn(expected);

		var response = controller.create(authUser, request);

		assertThat(response.data()).isEqualTo(expected);
		verify(service).create(1L, request);
	}
}
