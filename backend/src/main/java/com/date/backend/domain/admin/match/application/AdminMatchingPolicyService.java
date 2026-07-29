package com.date.backend.domain.admin.match.application;

import com.date.backend.domain.admin.match.dto.request.MatchingPolicyUpdateRequest;
import com.date.backend.domain.admin.match.dto.response.MatchingPolicyResponse;
import com.date.backend.domain.match.application.MatchJobEnqueueService;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchingPolicy;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.match.repository.MatchingPolicyRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AdminMatchErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AdminMatchingPolicyService {

	private final MatchingPolicyRepository policyRepository;
	private final MatchRequestRepository matchRequestRepository;
	private final MatchJobEnqueueService jobEnqueueService;

	public AdminMatchingPolicyService(
			MatchingPolicyRepository policyRepository,
			MatchRequestRepository matchRequestRepository,
			MatchJobEnqueueService jobEnqueueService
	) {
		this.policyRepository = policyRepository;
		this.matchRequestRepository = matchRequestRepository;
		this.jobEnqueueService = jobEnqueueService;
	}

	public MatchingPolicyResponse get() {
		return MatchingPolicyResponse.from(findPolicy());
	}

	@Transactional
	public MatchingPolicyResponse update(Long adminUserId, MatchingPolicyUpdateRequest request) {
		validateRequest(request);
		MatchingPolicy policy = policyRepository
				.findByIdForUpdate(MatchingPolicy.SINGLETON_ID)
				.orElseThrow(() -> new BusinessException(AdminMatchErrorCode.MATCHING_POLICY_NOT_FOUND));
		try {
			policy.update(
					valueOr(request.faceTypeWeight(), policy.getFaceTypeWeight()),
					valueOr(request.personalityWeight(), policy.getPersonalityWeight()),
					valueOr(request.acceptTimeoutHours(), policy.getAcceptTimeoutHours()),
					valueOr(request.minimumAcceptanceWindowMinutes(), policy.getMinimumAcceptanceWindowMinutes()),
					valueOr(request.minimumPreparationMinutes(), policy.getMinimumPreparationMinutes()),
					valueOr(request.scheduleSearchDays(), policy.getScheduleSearchDays()),
					valueOr(request.recentMatchExclusionDays(), policy.getRecentMatchExclusionDays()),
					valueOr(request.lateCancellationMinutes(), policy.getLateCancellationMinutes()),
					adminUserId
			);
		} catch (IllegalArgumentException exception) {
			throw new BusinessException(AdminMatchErrorCode.INVALID_MATCHING_POLICY, exception.getMessage());
		}
		requeueWaitingRequests();
		return MatchingPolicyResponse.from(policy);
	}

	private MatchingPolicy findPolicy() {
		return policyRepository.findById(MatchingPolicy.SINGLETON_ID)
				.orElseThrow(() -> new BusinessException(AdminMatchErrorCode.MATCHING_POLICY_NOT_FOUND));
	}

	private void validateRequest(MatchingPolicyUpdateRequest request) {
		if (request == null || request.isEmpty()) {
			throw new BusinessException(AdminMatchErrorCode.EMPTY_MATCHING_POLICY_UPDATE);
		}
		if (request.hasOnlyOneWeight()) {
			throw new BusinessException(AdminMatchErrorCode.MATCHING_WEIGHTS_MUST_BE_UPDATED_TOGETHER);
		}
	}

	private int valueOr(Integer value, int currentValue) {
		return value == null ? currentValue : value;
	}

	private void requeueWaitingRequests() {
		for (MatchRequest request : matchRequestRepository
				.findAllByStatusOrderByRequestedAtAscIdAsc(MatchRequestStatus.WAITING)) {
			jobEnqueueService.enqueue(request);
		}
	}
}
