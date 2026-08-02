package com.date.backend.domain.result.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.result.dto.PeerEvaluationSubmitRequest;
import com.date.backend.domain.result.event.PeerEvaluationsCompletedEvent;
import com.date.backend.domain.result.repository.PeerEvaluationRepository;
import com.date.backend.domain.room.application.WaitingRoomProvisioningService;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ResultErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:peer-evaluation-integration;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false",
		"match.worker.enabled=false",
		"session.realtime.monitor-enabled=false",
		"session.timer.enabled=false"
})
@ActiveProfiles("test")
@RecordApplicationEvents
class PeerEvaluationIntegrationTest {
	private static final LocalDateTime SESSION_TIME =
			LocalDateTime.of(2026, 7, 30, 20, 0);

	@Autowired private UserRepository userRepository;
	@Autowired private FaceTagCatalogRepository faceTagRepository;
	@Autowired private MatchRequestRepository matchRequestRepository;
	@Autowired private MatchPairRepository matchPairRepository;
	@Autowired private WaitingRoomRepository sessionRepository;
	@Autowired private RoomParticipantRepository participantRepository;
	@Autowired private WaitingRoomProvisioningService provisioningService;
	@Autowired private PeerEvaluationService evaluationService;
	@Autowired private PeerEvaluationRepository evaluationRepository;
	@Autowired private TransactionTemplate transactionTemplate;
	@Autowired private ApplicationEvents applicationEvents;

	@MockitoBean
	private LiveKitRoomManager liveKitRoomManager;

	@Test
	void bothParticipantsSubmitOnceAndCanReadReceivedResult() {
		SessionFixture fixture = createEndedSession(
				SessionTerminationReason.TIME_EXPIRED
		);

		var firstSubmission = evaluationService.submit(
				fixture.firstUserId(), fixture.sessionId(), request(5)
		);
		var secondSubmission = evaluationService.submit(
				fixture.secondUserId(), fixture.sessionId(), request(4)
		);

		assertThat(firstSubmission.allSubmitted()).isFalse();
		assertThat(firstSubmission.reportRequested()).isFalse();
		assertThat(secondSubmission.allSubmitted()).isTrue();
		assertThat(secondSubmission.reportRequested()).isTrue();
		assertThat(evaluationRepository.countBySessionId(fixture.sessionId()))
				.isEqualTo(2);
		assertThat(evaluationService.getStatus(
				fixture.firstUserId(), fixture.sessionId()
		).allSubmitted()).isTrue();
		var receivedResult = evaluationService.getResult(
				fixture.firstUserId(), fixture.sessionId()
		);
		assertThat(receivedResult.comfortScore()).isEqualTo(4);
		assertThat(receivedResult.goodBehaviorText()).isEqualTo("좋았어요.");
		assertThat(receivedResult.improvementText())
				.isEqualTo("조금 더 질문해 주세요.");
		assertThat(applicationEvents.stream(PeerEvaluationsCompletedEvent.class))
				.hasSize(1);

		assertThatThrownBy(() -> evaluationService.submit(
				fixture.firstUserId(), fixture.sessionId(), request(3)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode())
						.isEqualTo(ResultErrorCode.EVALUATION_ALREADY_SUBMITTED)
		);
	}

	@Test
	void normalCompletionAllowsEvaluation() {
		SessionFixture fixture = createEndedSession(
				SessionTerminationReason.NORMAL_COMPLETION
		);

		assertThat(evaluationService.getItems(
				fixture.firstUserId(), fixture.sessionId()
		).items()).hasSize(6);
	}

	@Test
	void cancelledSessionRejectsEvaluation() {
		SessionFixture fixture = createEndedSession(
				SessionTerminationReason.USER_REQUEST
		);

		assertThatThrownBy(() -> evaluationService.getItems(
				fixture.firstUserId(), fixture.sessionId()
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode())
						.isEqualTo(ResultErrorCode.EVALUATION_SESSION_NOT_COMPLETED)
		);
	}

	@Test
	void optionalTextCanBeOmittedAndIsReturnedAsNull() {
		SessionFixture fixture = createEndedSession(
				SessionTerminationReason.TIME_EXPIRED
		);
		evaluationService.submit(
				fixture.firstUserId(), fixture.sessionId(), request(5)
		);
		evaluationService.submit(
				fixture.secondUserId(),
				fixture.sessionId(),
				new PeerEvaluationSubmitRequest(
						4, 4, 4, 4, 4, 4, null, " "
				)
		);

		var received = evaluationService.getResult(
				fixture.firstUserId(), fixture.sessionId()
		);
		assertThat(received.goodBehaviorText()).isNull();
		assertThat(received.improvementText()).isNull();
	}

	private SessionFixture createEndedSession(SessionTerminationReason reason) {
		String suffix = UUID.randomUUID().toString().replace("-", "");
		User firstUser = saveUser(suffix, "a", "1");
		User secondUser = saveUser(suffix, "b", "2");
		var faceTag = faceTagRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc()
				.getFirst();
		MatchRequest firstRequest = matchRequestRepository.saveAndFlush(
				new MatchRequest(firstUser.getId(), (short) 20, (short) 40,
						faceTag, faceTag, SESSION_TIME.minusHours(2))
		);
		MatchRequest secondRequest = matchRequestRepository.saveAndFlush(
				new MatchRequest(secondUser.getId(), (short) 20, (short) 40,
						faceTag, faceTag, SESSION_TIME.minusHours(2))
		);
		MatchPair pair = new MatchPair(
				firstRequest, secondRequest,
				new BigDecimal("25.000"), new BigDecimal("25.000"),
				SESSION_TIME.minusHours(1), SESSION_TIME,
				SESSION_TIME.minusHours(2)
		);
		pair.confirm(SESSION_TIME.minusMinutes(90));
		pair = matchPairRepository.saveAndFlush(pair);
		provisioningService.provision(pair);

		WaitingRoom session = sessionRepository.findByMatchPair_Id(pair.getId())
				.orElseThrow();
		List<RoomParticipant> participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(session.getId());
		transactionTemplate.executeWithoutResult(status -> {
			WaitingRoom managed = sessionRepository
					.findWithMatchPairByIdForUpdate(session.getId())
					.orElseThrow();
			participantRepository.findAllByRoom_IdOrderByUserIdAsc(managed.getId())
					.forEach(participant -> {
						participant.recordJoin(SESSION_TIME.minusMinutes(1));
						participant.markReady();
					});
			managed.markWaiting();
			managed.markReady();
			managed.start(SESSION_TIME);
			if (reason == SessionTerminationReason.NORMAL_COMPLETION
					|| reason == SessionTerminationReason.TIME_EXPIRED) {
				managed.complete(
						SESSION_TIME.plusMinutes(30),
						reason,
						reason == SessionTerminationReason.NORMAL_COMPLETION
								? firstUser.getId()
								: null
				);
			} else {
				managed.terminate(
						SESSION_TIME.plusMinutes(10),
						reason,
						firstUser.getId()
				);
			}
		});
		return new SessionFixture(
				session.getId(),
				participants.getFirst().getUserId(),
				participants.getLast().getUserId()
		);
	}

	private User saveUser(String suffix, String marker, String phoneMarker) {
		String compact = suffix.substring(0, 8);
		return userRepository.saveAndFlush(new User(
				"result-" + compact + marker + "@example.com",
				"password",
				"평가테스트" + compact + marker,
				"010" + phoneMarker + suffix.substring(8, 15),
				LocalDate.of(2000, 1, 1)
		));
	}

	private PeerEvaluationSubmitRequest request(int score) {
		return new PeerEvaluationSubmitRequest(
				score, score, score, score, score, score,
				"좋았어요.", "조금 더 질문해 주세요."
		);
	}

	private record SessionFixture(
			Long sessionId,
			Long firstUserId,
			Long secondUserId
	) {
	}
}
