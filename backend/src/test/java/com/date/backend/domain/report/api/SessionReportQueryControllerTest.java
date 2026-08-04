package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionReportQueryService;
import com.date.backend.domain.report.dto.response.*;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SessionReportQueryControllerTest {
	@Test
	void delegatesAuthenticatedUserForBothQueries() {
		SessionReportQueryService service = mock(SessionReportQueryService.class);
		SessionReportSummaryResponse summary = mock(SessionReportSummaryResponse.class);
		SessionReportDetailResponse detail = mock(SessionReportDetailResponse.class);
		when(service.getBySession(2L, 1L)).thenReturn(summary);
		when(service.getDetail(2L, 10L)).thenReturn(detail);
		var controller = new SessionReportQueryController(service);
		var auth = new AuthUser(2L, "report@example.com", UserRole.USER);

		assertThat(controller.getBySession(auth, 1L).data()).isSameAs(summary);
		assertThat(controller.getDetail(auth, 10L).data()).isSameAs(detail);
	}
}
