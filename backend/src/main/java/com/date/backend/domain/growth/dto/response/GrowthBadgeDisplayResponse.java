package com.date.backend.domain.growth.dto.response;

public record GrowthBadgeDisplayResponse(
        Long badgeId,
        boolean displayed,
        boolean changed
) {
}
