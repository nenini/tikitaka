package com.date.backend.domain.growth.dto.response;
import java.time.LocalDateTime;
public record GrowthBadgeResponse(Long badgeId, String code, String name, String description, String iconUrl,
        String conditionType, long currentCount, int thresholdCount, int progressPercent,
        boolean acquired, LocalDateTime acquiredAt, boolean displayed, boolean active, String policyVersion) {}
