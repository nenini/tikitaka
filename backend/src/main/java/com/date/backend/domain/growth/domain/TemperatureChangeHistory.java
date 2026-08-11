package com.date.backend.domain.growth.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity @Table(name = "temperature_change_histories", uniqueConstraints =
        @UniqueConstraint(name = "uk_temperature_history_source", columnNames = {"sourceType", "sourceId", "policyVersion"}))
public class TemperatureChangeHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "temperatureChangeHistoryId") private Long id;
    @Column(name = "userId", nullable = false) private Long userId;
    @Column(name = "sessionId") private Long sessionId;
    @Enumerated(EnumType.STRING) @Column(name = "sourceType", nullable = false, length = 30) private TemperatureSourceType sourceType;
    @Column(name = "sourceId", nullable = false) private Long sourceId;
    @Enumerated(EnumType.STRING) @Column(name = "reason", nullable = false, length = 50) private TemperatureChangeReason reason;
    @Column(name = "delta", nullable = false, precision = 5, scale = 2) private BigDecimal delta;
    @Column(name = "beforeTemperature", nullable = false, precision = 5, scale = 2) private BigDecimal beforeTemperature;
    @Column(name = "afterTemperature", nullable = false, precision = 5, scale = 2) private BigDecimal afterTemperature;
    @Column(name = "policyVersion", nullable = false, length = 50) private String policyVersion;
    @Column(name = "changedAt", nullable = false) private LocalDateTime changedAt;
    protected TemperatureChangeHistory() {}
    public TemperatureChangeHistory(Long userId, Long sessionId, TemperatureSourceType sourceType, Long sourceId,
            TemperatureChangeReason reason, BigDecimal delta, BigDecimal before, BigDecimal after,
            String policyVersion, LocalDateTime changedAt) {
        this.userId=userId; this.sessionId=sessionId; this.sourceType=sourceType; this.sourceId=sourceId;
        this.reason=reason; this.delta=delta; this.beforeTemperature=before; this.afterTemperature=after;
        this.policyVersion=policyVersion; this.changedAt=changedAt;
    }
    public Long getId(){return id;} public Long getUserId(){return userId;} public Long getSessionId(){return sessionId;}
    public TemperatureSourceType getSourceType(){return sourceType;} public Long getSourceId(){return sourceId;}
    public TemperatureChangeReason getReason(){return reason;} public BigDecimal getDelta(){return delta;}
    public BigDecimal getBeforeTemperature(){return beforeTemperature;} public BigDecimal getAfterTemperature(){return afterTemperature;}
    public LocalDateTime getChangedAt(){return changedAt;}
}
