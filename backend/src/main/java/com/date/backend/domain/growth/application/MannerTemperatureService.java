package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.*;
import com.date.backend.domain.growth.dto.response.*;
import com.date.backend.domain.growth.repository.*;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CommonErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.*;
import java.time.*;
import java.util.List;

@Service
public class MannerTemperatureService {
    public static final String POLICY_VERSION = "temperature-v1.0.0";
    public static final BigDecimal MINIMUM = new BigDecimal("20.00");
    public static final BigDecimal MAXIMUM = new BigDecimal("50.00");
    private final UserRepository userRepository;
    private final UserTemperatureRepository temperatureRepository;
    private final TemperatureChangeHistoryRepository historyRepository;
    private final Clock clock;

    public MannerTemperatureService(UserRepository userRepository, UserTemperatureRepository temperatureRepository,
            TemperatureChangeHistoryRepository historyRepository, Clock clock) {
        this.userRepository=userRepository; this.temperatureRepository=temperatureRepository;
        this.historyRepository=historyRepository; this.clock=clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void applyEvaluation(Long evaluationId, Long sessionId, Long userId, int comfort, int question,
            int listening, int reaction, int balance, int manner, LocalDateTime occurredAt) {
        BigDecimal weighted = BigDecimal.valueOf(comfort).multiply(new BigDecimal("0.20"))
                .add(BigDecimal.valueOf(question).multiply(new BigDecimal("0.10")))
                .add(BigDecimal.valueOf(listening).multiply(new BigDecimal("0.15")))
                .add(BigDecimal.valueOf(reaction).multiply(new BigDecimal("0.15")))
                .add(BigDecimal.valueOf(balance).multiply(new BigDecimal("0.10")))
                .add(BigDecimal.valueOf(manner).multiply(new BigDecimal("0.30")));
        PolicyDecision decision = evaluationDecision(weighted);
        apply(userId, sessionId, TemperatureSourceType.EVALUATION, evaluationId, decision.reason,
                decision.delta, occurredAt);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void applyNoShow(Long penaltyId, Long sessionId, Long userId, LocalDateTime occurredAt) {
        apply(userId, sessionId, TemperatureSourceType.NO_SHOW, penaltyId,
                TemperatureChangeReason.NO_SHOW, new BigDecimal("-1.50"), occurredAt);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void reverseEvaluation(Long evaluationId) {
        reverse(TemperatureSourceType.EVALUATION, TemperatureSourceType.EVALUATION_REVERSAL,
                TemperatureChangeReason.EVALUATION_REVERSED, evaluationId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void reverseNoShow(Long penaltyId) {
        reverse(TemperatureSourceType.NO_SHOW, TemperatureSourceType.NO_SHOW_REVERSAL,
                TemperatureChangeReason.NO_SHOW_REVERSED, penaltyId);
    }

    @Transactional
    public UserTemperatureResponse getTemperature(Long userId) {
        UserTemperature temperature = lockedTemperature(userId);
        List<TemperatureChangeResponse> histories = historyRepository.findTop10ByUserIdOrderByChangedAtDescIdDesc(userId)
                .stream().map(this::toResponse).toList();
        return new UserTemperatureResponse(temperature.getTemperature(), MINIMUM, MAXIMUM,
                temperature.getPolicyVersion(), histories.isEmpty() ? null : histories.getFirst(), histories);
    }

    private void reverse(TemperatureSourceType originalType, TemperatureSourceType reversalType,
            TemperatureChangeReason reason, Long sourceId) {
        TemperatureChangeHistory original = historyRepository
                .findBySourceTypeAndSourceIdAndPolicyVersion(originalType, sourceId, POLICY_VERSION)
                .orElse(null);
        if (original == null) return;
        apply(original.getUserId(),
                original.getSessionId(), reversalType, sourceId, reason, original.getDelta().negate(), LocalDateTime.now(clock));
    }

    private void apply(Long userId, Long sessionId, TemperatureSourceType sourceType, Long sourceId,
            TemperatureChangeReason reason, BigDecimal requestedDelta, LocalDateTime occurredAt) {
        if (historyRepository.existsBySourceTypeAndSourceIdAndPolicyVersion(sourceType, sourceId, POLICY_VERSION)) return;
        UserTemperature temperature = lockedTemperature(userId);
        if (historyRepository.existsBySourceTypeAndSourceIdAndPolicyVersion(sourceType, sourceId, POLICY_VERSION)) return;
        BigDecimal before = temperature.getTemperature();
        BigDecimal actualDelta = temperature.apply(requestedDelta, MINIMUM, MAXIMUM, POLICY_VERSION, LocalDateTime.now(clock));
        temperatureRepository.save(temperature);
        historyRepository.save(new TemperatureChangeHistory(userId, sessionId, sourceType, sourceId, reason,
                actualDelta, before, temperature.getTemperature(), POLICY_VERSION, occurredAt));
    }

    private UserTemperature lockedTemperature(Long userId) {
        userRepository.findByIdForUpdate(userId).orElseThrow(() -> new BusinessException(CommonErrorCode.INVALID_INPUT));
        return temperatureRepository.findByUserIdForUpdate(userId)
                .orElseGet(() -> temperatureRepository.save(new UserTemperature(userId, POLICY_VERSION, LocalDateTime.now(clock))));
    }

    private PolicyDecision evaluationDecision(BigDecimal score) {
        if (score.compareTo(new BigDecimal("4.50")) >= 0) return new PolicyDecision(new BigDecimal("0.30"), TemperatureChangeReason.VERY_POSITIVE_EVALUATION);
        if (score.compareTo(new BigDecimal("4.00")) >= 0) return new PolicyDecision(new BigDecimal("0.15"), TemperatureChangeReason.POSITIVE_EVALUATION);
        if (score.compareTo(new BigDecimal("3.00")) >= 0) return new PolicyDecision(BigDecimal.ZERO.setScale(2), TemperatureChangeReason.NEUTRAL_EVALUATION);
        if (score.compareTo(new BigDecimal("2.00")) >= 0) return new PolicyDecision(new BigDecimal("-0.20"), TemperatureChangeReason.NEGATIVE_EVALUATION);
        return new PolicyDecision(new BigDecimal("-0.50"), TemperatureChangeReason.VERY_NEGATIVE_EVALUATION);
    }

    private TemperatureChangeResponse toResponse(TemperatureChangeHistory h) {
        return new TemperatureChangeResponse(h.getId(), h.getSessionId(), h.getSourceType().name(), h.getSourceId(),
                h.getReason().name(), h.getDelta(), h.getBeforeTemperature(), h.getAfterTemperature(), h.getChangedAt());
    }
    private record PolicyDecision(BigDecimal delta, TemperatureChangeReason reason) {}
}
