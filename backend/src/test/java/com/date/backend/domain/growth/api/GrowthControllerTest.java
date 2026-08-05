package com.date.backend.domain.growth.api;

import com.date.backend.domain.growth.application.GrowthSessionQueryService;
import com.date.backend.domain.growth.application.GrowthMetricAggregationService;
import com.date.backend.domain.growth.application.MannerTemperatureService;
import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import com.date.backend.domain.growth.dto.response.GrowthSessionHistoryResponse;
import com.date.backend.domain.user.domain.UserRole;
import com.date.backend.global.security.AuthUser;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class GrowthControllerTest {
	@Test
	void delegatesAuthenticatedUserAndFilters() {
		GrowthSessionQueryService service = mock(GrowthSessionQueryService.class);
		GrowthSessionHistoryResponse expected = mock(GrowthSessionHistoryResponse.class);
		LocalDate from = LocalDate.of(2026, 7, 1);
		LocalDate to = LocalDate.of(2026, 8, 4);
		when(service.getHistory(7L, from, to, GrowthSessionStatus.COMPLETED, 20L, 10))
				.thenReturn(expected);
		GrowthController controller = new GrowthController(service, mock(GrowthMetricAggregationService.class),
				mock(MannerTemperatureService.class));
		AuthUser auth = new AuthUser(7L, "growth@example.com", UserRole.USER);

		assertThat(controller.getSessions(auth, from, to, GrowthSessionStatus.COMPLETED, 20L, 10).data())
				.isSameAs(expected);
	}
}
