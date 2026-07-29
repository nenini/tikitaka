package com.date.backend.domain.notification.application;

import com.date.backend.domain.match.config.MatchPolicyProperties;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.notification.config.NotificationWaitingRecommendationProperties;
import com.date.backend.domain.notification.domain.NotificationPresentation;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Service
public class MatchWaitingRecommendationNotificationService {

	private final MatchRequestRepository matchRequestRepository;
	private final NotificationJobSchedulingService jobSchedulingService;
	private final MatchPolicyProperties matchPolicyProperties;
	private final NotificationWaitingRecommendationProperties properties;

	public MatchWaitingRecommendationNotificationService(
			MatchRequestRepository matchRequestRepository,
			NotificationJobSchedulingService jobSchedulingService,
			MatchPolicyProperties matchPolicyProperties,
			NotificationWaitingRecommendationProperties properties
	) {
		this.matchRequestRepository = matchRequestRepository;
		this.jobSchedulingService = jobSchedulingService;
		this.matchPolicyProperties = matchPolicyProperties;
		this.properties = properties;
	}

	@Transactional
	public int scheduleDue(LocalDateTime now) {
		LocalDateTime notificationTime = Objects.requireNonNull(now);
		LocalDateTime cutoff = notificationTime.minusSeconds(
				matchPolicyProperties.settingRecommendationDelaySeconds()
		);
		List<MatchRequest> targets = matchRequestRepository
				.findUnnotifiedWaitingRecommendationTargetsForUpdate(
						MatchRequestStatus.WAITING,
						cutoff,
						PageRequest.of(0, properties.batchSize())
				);
		targets.forEach(request -> schedule(request, notificationTime));
		return targets.size();
	}

	private void schedule(
			MatchRequest request,
			LocalDateTime scheduledAt
	) {
		jobSchedulingService.schedule(
				request.getUserId(),
				NotificationType.MATCH_SETTING_RECOMMENDED,
				"매칭 설정을 조정해 볼까요?",
				"24시간 동안 매칭이 성사되지 않았어요. "
						+ "선호 조건이나 가능한 시간을 조정하면 "
						+ "더 빠르게 상대를 찾을 수 있어요.",
				NotificationReferenceType.MATCH_REQUEST,
				request.getId(),
				NotificationPresentation.BELL_AND_TOAST,
				deduplicationKey(request),
				scheduledAt
		);
		request.markSettingRecommendationSent(scheduledAt);
	}

	private String deduplicationKey(MatchRequest request) {
		return NotificationType.MATCH_SETTING_RECOMMENDED.name()
				+ ":" + request.getId()
				+ ":" + request.getWaitingStartedAt();
	}
}
