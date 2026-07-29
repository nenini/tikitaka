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
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminMatchingPolicyServiceTest {

	private final MatchingPolicyRepository policyRepository =
			mock(MatchingPolicyRepository.class);
	private final MatchRequestRepository requestRepository =
			mock(MatchRequestRepository.class);
	private final MatchJobEnqueueService enqueueService =
			mock(MatchJobEnqueueService.class);
	private final AdminMatchingPolicyService service =
			new AdminMatchingPolicyService(
					policyRepository,
					requestRepository,
					enqueueService
			);

	@Test
	void updatesPolicyAndRequeuesWaitingRequests() {
		MatchingPolicy policy = defaultPolicy();
		MatchRequest waiting = mock(MatchRequest.class);
		when(policyRepository.findByIdForUpdate(MatchingPolicy.SINGLETON_ID))
				.thenReturn(Optional.of(policy));
		when(requestRepository.findAllByStatusOrderByRequestedAtAscIdAsc(
				MatchRequestStatus.WAITING
		)).thenReturn(List.of(waiting));

		MatchingPolicyResponse response = service.update(
				99L,
				new MatchingPolicyUpdateRequest(
						70,
						30,
						10,
						90,
						60,
						14,
						10,
						45
				)
		);

		assertThat(response.faceTypeWeight()).isEqualTo(70);
		assertThat(response.personalityWeight()).isEqualTo(30);
		assertThat(response.policyVersion()).isEqualTo(2);
		assertThat(response.updatedBy()).isEqualTo(99L);
		verify(enqueueService).enqueue(waiting);
	}

	@Test
	void rejectsUpdatingOnlyOneWeight() {
		assertThatThrownBy(() -> service.update(
				99L,
				new MatchingPolicyUpdateRequest(
						70,
						null,
						null,
						null,
						null,
						null,
						null,
						null
				)
		)).isInstanceOf(BusinessException.class);
	}

	private MatchingPolicy defaultPolicy() {
		return new MatchingPolicy(50, 50, 8, 60, 60, 7, 7, 60);
	}
}
