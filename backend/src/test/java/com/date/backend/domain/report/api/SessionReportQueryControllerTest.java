package com.date.backend.domain.report.api;

import com.date.backend.domain.report.application.SessionReportQueryService;
import com.date.backend.domain.report.application.SessionReportCommandService;
import com.date.backend.domain.report.dto.response.*;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SessionReportQueryControllerTest {
	@Test
	void delegatesAuthenticatedUserForPublicReportApis() {
		SessionReportQueryService service = mock(SessionReportQueryService.class);
		SessionReportCommandService commandService = mock(SessionReportCommandService.class);
		SessionReportSummaryResponse summary = mock(SessionReportSummaryResponse.class);
		SessionReportDetailResponse detail = mock(SessionReportDetailResponse.class);
		SessionReportStatusResponse status = mock(SessionReportStatusResponse.class);
		ReportAxisDetailResponse axis = mock(ReportAxisDetailResponse.class);
		SessionReportDeleteResponse deleted = mock(SessionReportDeleteResponse.class);
		when(service.getBySession(2L, 1L)).thenReturn(summary);
		when(service.getDetail(2L, 10L)).thenReturn(detail);
		when(service.getStatus(2L, 1L)).thenReturn(status);
		when(service.getAxis(2L, 10L, "flow")).thenReturn(axis);
		when(commandService.request(2L, 1L)).thenReturn(status);
		when(commandService.delete(2L, 10L)).thenReturn(deleted);
		var controller = new SessionReportQueryController(service, commandService);
		var auth = new AuthUser(2L, "report@example.com", UserRole.USER);

		assertThat(controller.getBySession(auth, 1L).data()).isSameAs(summary);
		assertThat(controller.getDetail(auth, 10L).data()).isSameAs(detail);
		assertThat(controller.requestGeneration(auth, 1L).data()).isSameAs(status);
		assertThat(controller.getStatus(auth, 1L).data()).isSameAs(status);
		assertThat(controller.getAxis(auth, 10L, "flow").data()).isSameAs(axis);
		assertThat(controller.delete(auth, 10L).data()).isSameAs(deleted);
	}
}
