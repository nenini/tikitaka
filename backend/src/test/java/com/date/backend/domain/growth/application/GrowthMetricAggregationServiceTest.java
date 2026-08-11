package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.repository.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GrowthMetricAggregationServiceTest {
    private final CompletedReportMetricRepository reportRepository = mock(CompletedReportMetricRepository.class);
    private final GrowthMetricSnapshotRepository snapshotRepository = mock(GrowthMetricSnapshotRepository.class);
    private final GrowthMetricAggregationService service =
            new GrowthMetricAggregationService(reportRepository, snapshotRepository);

    @Test
    void comparesCurrentAndPreviousPeriodsAndKeepsUnmeasuredAxisNull() {
        when(reportRepository.findCompletedMetrics(7L)).thenReturn(List.of());
        when(snapshotRepository.findScores(eq(7L), eq(LocalDateTime.of(2026, 7, 1, 0, 0)),
                eq(LocalDateTime.of(2026, 7, 31, 0, 0))))
                .thenReturn(List.of(row("4.0", null, "3.0", "4.0", "3.5", "2.0"),
                        row("5.0", null, "4.0", "4.0", "4.5", "3.0")));
        when(snapshotRepository.findScores(eq(7L), eq(LocalDateTime.of(2026, 6, 1, 0, 0)),
                eq(LocalDateTime.of(2026, 7, 1, 0, 0))))
                .thenReturn(List.<Object[]>of(row("3.0", null, "3.0", "3.0", "3.0", "2.0")));

        var result = service.getMetrics(7L, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 30));

        assertThat(result.axes().get("flow").currentAverage()).isEqualByComparingTo("4.50");
        assertThat(result.axes().get("flow").change()).isEqualByComparingTo("1.50");
        assertThat(result.axes().get("question").currentAverage()).isNull();
        assertThat(result.axes().get("question").measured()).isFalse();
        assertThat(result.currentSessionCount()).isEqualTo(2);
    }

    private Object[] row(String... values) {
        Object[] row = new Object[values.length];
        for (int i = 0; i < values.length; i++) row[i] = values[i] == null ? null : new BigDecimal(values[i]);
        return row;
    }
}
