package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.*;
import com.date.backend.domain.growth.repository.*;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.math.BigDecimal;
import java.time.*;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MannerTemperatureServiceTest {
    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserTemperatureRepository temperatureRepository = mock(UserTemperatureRepository.class);
    private final TemperatureChangeHistoryRepository historyRepository = mock(TemperatureChangeHistoryRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-08-05T00:00:00Z"), ZoneId.of("Asia/Seoul"));
    private final MannerTemperatureService service = new MannerTemperatureService(
            userRepository, temperatureRepository, historyRepository, clock);

    @Test
    void veryPositiveEvaluationRaisesTemperatureWithWeightedPolicy() {
        UserTemperature temperature = new UserTemperature(7L, MannerTemperatureService.POLICY_VERSION,
                LocalDateTime.now(clock));
        when(userRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(mock(User.class)));
        when(temperatureRepository.findByUserIdForUpdate(7L)).thenReturn(Optional.of(temperature));

        service.applyEvaluation(11L, 3L, 7L, 5, 5, 5, 4, 5, 5, LocalDateTime.now(clock));

        assertThat(temperature.getTemperature()).isEqualByComparingTo("36.80");
        ArgumentCaptor<TemperatureChangeHistory> captor = ArgumentCaptor.forClass(TemperatureChangeHistory.class);
        verify(historyRepository).save(captor.capture());
        assertThat(captor.getValue().getReason()).isEqualTo(TemperatureChangeReason.VERY_POSITIVE_EVALUATION);
        assertThat(captor.getValue().getDelta()).isEqualByComparingTo("0.30");
    }

    @Test
    void duplicateEvaluationDoesNotChangeTemperatureAgain() {
        when(historyRepository.existsBySourceTypeAndSourceIdAndPolicyVersion(
                TemperatureSourceType.EVALUATION, 11L, MannerTemperatureService.POLICY_VERSION)).thenReturn(true);
        service.applyEvaluation(11L, 3L, 7L, 5, 5, 5, 5, 5, 5, LocalDateTime.now(clock));
        verifyNoInteractions(userRepository, temperatureRepository);
    }

    @Test
    void noShowDeductsOnePointFive() {
        UserTemperature temperature = new UserTemperature(7L, MannerTemperatureService.POLICY_VERSION,
                LocalDateTime.now(clock));
        when(userRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(mock(User.class)));
        when(temperatureRepository.findByUserIdForUpdate(7L)).thenReturn(Optional.of(temperature));
        service.applyNoShow(21L, 3L, 7L, LocalDateTime.now(clock));
        assertThat(temperature.getTemperature()).isEqualByComparingTo(new BigDecimal("35.00"));
    }

    @Test
    void reversingNoShowRestoresItsAppliedDelta() {
        LocalDateTime now = LocalDateTime.now(clock);
        UserTemperature temperature = new UserTemperature(7L, MannerTemperatureService.POLICY_VERSION, now);
        temperature.apply(new BigDecimal("-1.50"), MannerTemperatureService.MINIMUM,
                MannerTemperatureService.MAXIMUM, MannerTemperatureService.POLICY_VERSION, now);
        TemperatureChangeHistory original = new TemperatureChangeHistory(7L, 3L, TemperatureSourceType.NO_SHOW,
                21L, TemperatureChangeReason.NO_SHOW, new BigDecimal("-1.50"), new BigDecimal("36.50"),
                new BigDecimal("35.00"), MannerTemperatureService.POLICY_VERSION, now);
        when(historyRepository.findBySourceTypeAndSourceIdAndPolicyVersion(
                TemperatureSourceType.NO_SHOW, 21L, MannerTemperatureService.POLICY_VERSION)).thenReturn(Optional.of(original));
        when(userRepository.findByIdForUpdate(7L)).thenReturn(Optional.of(mock(User.class)));
        when(temperatureRepository.findByUserIdForUpdate(7L)).thenReturn(Optional.of(temperature));

        service.reverseNoShow(21L);

        assertThat(temperature.getTemperature()).isEqualByComparingTo("36.50");
    }
}
