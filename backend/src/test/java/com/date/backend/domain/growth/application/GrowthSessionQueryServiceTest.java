package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import com.date.backend.domain.growth.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.time.*;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GrowthSessionQueryServiceTest {
	private final GrowthSessionHistoryRepository repository = mock(GrowthSessionHistoryRepository.class);
	private final GrowthSessionQueryService service = new GrowthSessionQueryService(repository);

	@Test
	void returnsCursorPageWithOwnReportLink() {
		GrowthSessionHistoryProjection first = row(3L, "COMPLETED", 31L, "COMPLETED");
		GrowthSessionHistoryProjection second = row(2L, "CANCELLED", null, null);
		GrowthSessionHistoryProjection third = row(1L, "COMPLETED", 11L, "FAILED");
		when(repository.findHistory(eq(7L), isNull(), any(), any(), isNull(), any(Pageable.class)))
				.thenReturn(List.of(first, second, third));

		var response = service.getHistory(7L, LocalDate.of(2026, 7, 1),
				LocalDate.of(2026, 8, 4), null, null, 2);

		assertThat(response.sessions()).hasSize(2);
		assertThat(response.hasNext()).isTrue();
		assertThat(response.nextCursor()).isEqualTo(2L);
		assertThat(response.sessions().getFirst().report().exists()).isTrue();
		assertThat(response.sessions().get(1).status()).isEqualTo(GrowthSessionStatus.TERMINATED);
		assertThat(response.sessions().get(1).report().exists()).isFalse();
		assertThat(response.sessions().getFirst().partnerAlias()).isEqualTo("익명 상대");
	}

	@Test
	void rejectsInvalidPeriod() {
		assertThatThrownBy(() -> service.getHistory(7L, LocalDate.of(2026, 8, 5),
				LocalDate.of(2026, 8, 4), null, null, 20))
				.isInstanceOf(IllegalArgumentException.class);
	}

	private GrowthSessionHistoryProjection row(Long id, String status, Long reportId, String reportStatus) {
		GrowthSessionHistoryProjection row = mock(GrowthSessionHistoryProjection.class);
		when(row.getSessionId()).thenReturn(id);
		when(row.getSessionStatus()).thenReturn(status);
		when(row.getScheduledStartAt()).thenReturn(LocalDateTime.of(2026, 8, 1, 10, 0));
		when(row.getActualStartAt()).thenReturn(LocalDateTime.of(2026, 8, 1, 10, 0));
		when(row.getActualEndAt()).thenReturn(LocalDateTime.of(2026, 8, 1, 10, 30));
		when(row.getReportId()).thenReturn(reportId);
		when(row.getReportStatus()).thenReturn(reportStatus);
		return row;
	}
}
