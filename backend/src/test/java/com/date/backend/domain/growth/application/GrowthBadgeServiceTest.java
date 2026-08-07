package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.*;
import com.date.backend.domain.growth.repository.*;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.GrowthErrorCode;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class GrowthBadgeServiceTest {
    private final BadgeCatalogRepository catalogRepository = mock(BadgeCatalogRepository.class);
    private final UserBadgeRepository userBadgeRepository = mock(UserBadgeRepository.class);
    private final BadgeProgressRepository progressRepository = mock(BadgeProgressRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-08-05T00:00:00Z"), ZoneId.of("Asia/Seoul"));
    private final GrowthBadgeService service = new GrowthBadgeService(
            catalogRepository, userBadgeRepository, progressRepository, userRepository, clock);

    @Test
    void awardsSatisfiedActiveBadgeOnlyOnce() {
        BadgeCatalog badge = badge(1L, true, BadgeConditionType.SESSION_COMPLETED_COUNT, 5);
        when(userRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(mock(User.class)));
        when(progressRepository.countCompletedSessions(7L)).thenReturn(5L);
        when(progressRepository.countCompletedReports(7L)).thenReturn(0L);
        when(catalogRepository.findAllByOrderByDisplayOrderAscIdAsc()).thenReturn(List.of(badge));

        service.evaluateAndAward(7L);

        verify(userBadgeRepository).save(any(UserBadge.class));
    }

    @Test
    void inactiveBadgeIsVisibleButNotRetroactivelyAwarded() {
        BadgeCatalog badge = badge(1L, false, BadgeConditionType.SESSION_COMPLETED_COUNT, 1);
        when(userRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(mock(User.class)));
        when(progressRepository.countCompletedSessions(7L)).thenReturn(10L);
        when(progressRepository.countCompletedReports(7L)).thenReturn(0L);
        when(catalogRepository.findAllByOrderByDisplayOrderAscIdAsc()).thenReturn(List.of(badge));
        when(userBadgeRepository.findAllByUserId(7L)).thenReturn(List.of());

        var response = service.getBadges(7L);

        verify(userBadgeRepository, never()).save(any());
        assertThat(response.badges().getFirst().active()).isFalse();
        assertThat(response.badges().getFirst().progressPercent()).isEqualTo(100);
    }

    @Test
    void acquiredBadgeCanBeDisplayedAndHiddenIdempotently() {
        UserBadge acquired = mock(UserBadge.class);
        when(userBadgeRepository.findByUserIdAndBadgeIdForUpdate(7L, 1L))
                .thenReturn(Optional.of(acquired));
        when(acquired.display()).thenReturn(true, false);
        when(acquired.hide()).thenReturn(true, false);

        assertThat(service.display(7L, 1L).changed()).isTrue();
        assertThat(service.display(7L, 1L).changed()).isFalse();
        assertThat(service.hide(7L, 1L).changed()).isTrue();
        assertThat(service.hide(7L, 1L).changed()).isFalse();
    }

    @Test
    void badgeThatUserDidNotAcquireCannotBeDisplayed() {
        when(userBadgeRepository.findByUserIdAndBadgeIdForUpdate(7L, 99L))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.display(7L, 99L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(GrowthErrorCode.BADGE_NOT_ACQUIRED));
    }

    private BadgeCatalog badge(Long id, boolean active, BadgeConditionType type, int threshold) {
        BadgeCatalog badge = mock(BadgeCatalog.class);
        when(badge.getId()).thenReturn(id); when(badge.getCode()).thenReturn("TEST");
        when(badge.getName()).thenReturn("테스트"); when(badge.getConditionType()).thenReturn(type);
        when(badge.getThresholdCount()).thenReturn(threshold); when(badge.isActive()).thenReturn(active);
        when(badge.getPolicyVersion()).thenReturn("badge-v1.0.0"); return badge;
    }
}
