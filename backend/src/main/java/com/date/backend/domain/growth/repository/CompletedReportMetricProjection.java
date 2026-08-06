package com.date.backend.domain.growth.repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public interface CompletedReportMetricProjection {
    Long getReportId();
    Long getSessionId();
    Long getUserId();
    String getAnalysisVersion();
    BigDecimal getFlowScore();
    BigDecimal getQuestionScore();
    BigDecimal getListeningScore();
    BigDecimal getReactionScore();
    BigDecimal getBalanceScore();
    BigDecimal getNonverbalScore();
    LocalDateTime getMeasuredAt();
}
