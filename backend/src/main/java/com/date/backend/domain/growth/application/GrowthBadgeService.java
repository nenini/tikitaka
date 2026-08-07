package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.*;
import com.date.backend.domain.growth.dto.response.*;
import com.date.backend.domain.growth.repository.*;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CommonErrorCode;
import com.date.backend.global.exception.code.GrowthErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class GrowthBadgeService {
    private final BadgeCatalogRepository catalogRepository;
    private final UserBadgeRepository userBadgeRepository;
    private final BadgeProgressRepository progressRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    public GrowthBadgeService(BadgeCatalogRepository catalogRepository, UserBadgeRepository userBadgeRepository,
            BadgeProgressRepository progressRepository, UserRepository userRepository, Clock clock) {
        this.catalogRepository=catalogRepository; this.userBadgeRepository=userBadgeRepository;
        this.progressRepository=progressRepository; this.userRepository=userRepository; this.clock=clock;
    }

    @Transactional
    public void evaluateAndAward(Long userId) {
        userRepository.findByIdForUpdate(userId).orElseThrow(() -> new BusinessException(CommonErrorCode.INVALID_INPUT));
        Progress progress = progress(userId);
        for (BadgeCatalog badge : catalogRepository.findAllByOrderByDisplayOrderAscIdAsc()) {
            if (!badge.isActive() || badge.getConditionType() == null || badge.getThresholdCount() == null) continue;
            if (current(progress, badge.getConditionType()) < badge.getThresholdCount()) continue;
            if (!userBadgeRepository.existsByUserIdAndBadgeId(userId, badge.getId())) {
                userBadgeRepository.save(new UserBadge(userId, badge.getId(), LocalDateTime.now(clock), badge.getPolicyVersion()));
            }
        }
    }

    @Transactional
    public GrowthBadgesResponse getBadges(Long userId) {
        evaluateAndAward(userId);
        Progress progress = progress(userId);
        Map<Long, UserBadge> acquired = userBadgeRepository.findAllByUserId(userId).stream()
                .collect(Collectors.toMap(UserBadge::getBadgeId, Function.identity()));
        List<GrowthBadgeResponse> badges = catalogRepository.findAllByOrderByDisplayOrderAscIdAsc().stream()
                .map(badge -> response(badge, acquired.get(badge.getId()), progress)).toList();
        int acquiredCount = (int) badges.stream().filter(GrowthBadgeResponse::acquired).count();
        int activeCount = (int) badges.stream().filter(GrowthBadgeResponse::active).count();
        return new GrowthBadgesResponse(acquiredCount, activeCount, badges);
    }

    @Transactional
    public GrowthBadgeDisplayResponse display(Long userId, Long badgeId) {
        UserBadge badge = acquiredBadgeForUpdate(userId, badgeId);
        boolean changed = badge.display();
        return new GrowthBadgeDisplayResponse(badgeId, true, changed);
    }

    @Transactional
    public GrowthBadgeDisplayResponse hide(Long userId, Long badgeId) {
        UserBadge badge = acquiredBadgeForUpdate(userId, badgeId);
        boolean changed = badge.hide();
        return new GrowthBadgeDisplayResponse(badgeId, false, changed);
    }

    private GrowthBadgeResponse response(BadgeCatalog badge, UserBadge acquired, Progress progress) {
        int threshold = badge.getThresholdCount() == null ? 0 : badge.getThresholdCount();
        long count = badge.getConditionType() == null ? 0 : current(progress, badge.getConditionType());
        int percent = threshold <= 0 ? 0 : (int) Math.min(100, count * 100 / threshold);
        return new GrowthBadgeResponse(badge.getId(), badge.getCode(), badge.getName(), badge.getDescription(),
                badge.getIconUrl(), badge.getConditionType() == null ? null : badge.getConditionType().name(),
                count, threshold, percent, acquired != null, acquired == null ? null : acquired.getAwardedAt(),
                acquired != null && acquired.isDisplayed(), badge.isActive(), badge.getPolicyVersion());
    }

    private UserBadge acquiredBadgeForUpdate(Long userId, Long badgeId) {
        return userBadgeRepository.findByUserIdAndBadgeIdForUpdate(userId, badgeId)
                .orElseThrow(() -> new BusinessException(GrowthErrorCode.BADGE_NOT_ACQUIRED));
    }

    private Progress progress(Long userId) {
        return new Progress(progressRepository.countCompletedSessions(userId), progressRepository.countCompletedReports(userId));
    }
    private long current(Progress progress, BadgeConditionType type) {
        return type == BadgeConditionType.SESSION_COMPLETED_COUNT ? progress.sessions : progress.reports;
    }
    private record Progress(long sessions, long reports) {}
}
