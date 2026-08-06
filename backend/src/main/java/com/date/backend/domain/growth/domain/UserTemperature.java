package com.date.backend.domain.growth.domain;

import jakarta.persistence.*;
import java.math.*;
import java.time.LocalDateTime;

@Entity @Table(name = "user_temperatures")
public class UserTemperature {
    @Id @Column(name = "userId") private Long userId;
    @Column(name = "temperature", nullable = false, precision = 5, scale = 2) private BigDecimal temperature;
    @Column(name = "policyVersion", nullable = false, length = 50) private String policyVersion;
    @Version @Column(name = "version", nullable = false) private long version;
    @Column(name = "createdAt", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updatedAt", nullable = false) private LocalDateTime updatedAt;
    protected UserTemperature() {}
    public UserTemperature(Long userId, String policyVersion, LocalDateTime now) {
        this.userId = userId; this.temperature = new BigDecimal("36.50"); this.policyVersion = policyVersion;
        this.createdAt = now; this.updatedAt = now;
    }
    public BigDecimal apply(BigDecimal requestedDelta, BigDecimal minimum, BigDecimal maximum,
                            String policyVersion, LocalDateTime now) {
        BigDecimal before = temperature;
        temperature = before.add(requestedDelta).max(minimum).min(maximum).setScale(2, RoundingMode.HALF_UP);
        this.policyVersion = policyVersion; this.updatedAt = now;
        return temperature.subtract(before).setScale(2, RoundingMode.HALF_UP);
    }
    public Long getUserId() { return userId; }
    public BigDecimal getTemperature() { return temperature; }
    public String getPolicyVersion() { return policyVersion; }
}
