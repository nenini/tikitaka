package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.GrowthMetricSnapshot;
import com.date.backend.domain.growth.dto.response.*;
import com.date.backend.domain.growth.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CommonErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class GrowthMetricAggregationService {
    public static final String AGGREGATION_VERSION = "growth-v1.0.0";
    private static final List<String> AXES = List.of("flow", "question", "listening", "reaction", "balance", "nonverbal");
    private final CompletedReportMetricRepository reportRepository;
    private final GrowthMetricSnapshotRepository snapshotRepository;

    public GrowthMetricAggregationService(CompletedReportMetricRepository reportRepository, GrowthMetricSnapshotRepository snapshotRepository) {
        this.reportRepository = reportRepository; this.snapshotRepository = snapshotRepository;
    }

    @Transactional
    public GrowthMetricsResponse getMetrics(Long userId, LocalDate from, LocalDate to) {
        LocalDate currentTo = to == null ? LocalDate.now() : to;
        LocalDate currentFrom = from == null ? currentTo.minusDays(29) : from;
        if (currentFrom.isAfter(currentTo)) throw new BusinessException(CommonErrorCode.INVALID_INPUT);
        synchronize(userId);
        long days = ChronoUnit.DAYS.between(currentFrom, currentTo) + 1;
        LocalDate previousTo = currentFrom.minusDays(1);
        LocalDate previousFrom = previousTo.minusDays(days - 1);
        List<Object[]> current = scores(userId, currentFrom, currentTo);
        List<Object[]> previous = scores(userId, previousFrom, previousTo);
        Map<String, GrowthMetricAxisResponse> axes = new LinkedHashMap<>();
        for (int i = 0; i < AXES.size(); i++) {
            AxisAverage now = average(current, i), before = average(previous, i);
            BigDecimal change = now.value != null && before.value != null
                    ? now.value.subtract(before.value).setScale(2, RoundingMode.HALF_UP) : null;
            axes.put(AXES.get(i), new GrowthMetricAxisResponse(now.value, before.value, change,
                    now.count, before.count, now.value != null));
        }
        return new GrowthMetricsResponse(AGGREGATION_VERSION,
                new GrowthMetricPeriodResponse(currentFrom, currentTo),
                new GrowthMetricPeriodResponse(previousFrom, previousTo), current.size(), previous.size(), axes);
    }

    private void synchronize(Long userId) {
        for (CompletedReportMetricProjection source : reportRepository.findCompletedMetrics(userId)) {
            GrowthMetricSnapshot snapshot = snapshotRepository
                    .findBySessionReportIdAndAggregationVersion(source.getReportId(), AGGREGATION_VERSION)
                    .orElseGet(() -> new GrowthMetricSnapshot(source.getReportId(), source.getSessionId(), source.getUserId(),
                            source.getAnalysisVersion(), AGGREGATION_VERSION, source.getFlowScore(), source.getQuestionScore(),
                            source.getListeningScore(), source.getReactionScore(), source.getBalanceScore(),
                            source.getNonverbalScore(), source.getMeasuredAt()));
            snapshot.updateFrom(source.getAnalysisVersion(), source.getFlowScore(), source.getQuestionScore(),
                    source.getListeningScore(), source.getReactionScore(), source.getBalanceScore(),
                    source.getNonverbalScore(), source.getMeasuredAt());
            snapshotRepository.save(snapshot);
        }
    }

    private List<Object[]> scores(Long userId, LocalDate from, LocalDate to) {
        return snapshotRepository.findScores(userId, from.atStartOfDay(), to.plusDays(1).atStartOfDay());
    }

    private AxisAverage average(List<Object[]> rows, int index) {
        BigDecimal sum = BigDecimal.ZERO; int count = 0;
        for (Object[] row : rows) if (row[index] instanceof Number number) {
            sum = sum.add(new BigDecimal(number.toString())); count++;
        }
        return new AxisAverage(count == 0 ? null : sum.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP), count);
    }
    private record AxisAverage(BigDecimal value, int count) {}
}
