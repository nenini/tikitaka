package com.date.backend.domain.growth.dto.response;
import java.util.List;
public record GrowthBadgesResponse(int acquiredCount, int totalActiveCount, List<GrowthBadgeResponse> badges) {}
