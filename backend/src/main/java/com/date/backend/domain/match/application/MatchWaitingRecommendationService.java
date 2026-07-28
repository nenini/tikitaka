package com.date.backend.domain.match.application;

import com.date.backend.domain.match.config.MatchPolicyProperties;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Service
@Transactional(readOnly = true)
public class MatchWaitingRecommendationService {

	private final MatchRequestRepository requestRepository;
	private final MatchPolicyProperties properties;

	public MatchWaitingRecommendationService(
			MatchRequestRepository requestRepository,
			MatchPolicyProperties properties
	) {
		this.requestRepository = requestRepository;
		this.properties = properties;
	}

	public List<MatchWaitingRecommendationTarget> findDueTargets(
			LocalDateTime now,
			int limit
	) {
		LocalDateTime referenceTime = Objects.requireNonNull(now);
		if (limit <= 0) {
			throw new IllegalArgumentException("조회 개수는 0보다 커야 합니다.");
		}

		LocalDateTime cutoff = referenceTime.minusSeconds(
				properties.settingRecommendationDelaySeconds()
		);
		return requestRepository.findWaitingRecommendationTargets(
						MatchRequestStatus.WAITING,
						cutoff,
						PageRequest.of(0, limit)
				)
				.stream()
				.map(request -> new MatchWaitingRecommendationTarget(
						request.getUserId(),
						request.getId(),
						request.getWaitingStartedAt()
				))
				.toList();
	}
}
