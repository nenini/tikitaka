package com.date.backend.domain.coach.application;

import com.date.backend.domain.coach.domain.CoachingPriority;
import com.date.backend.domain.coach.domain.CoachingType;
import com.date.backend.domain.coach.dto.AiCoachingRequest;
import com.date.backend.domain.coach.repository.AiCoachingEventRepository;
import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.room.application.WaitingRoomProvisioningService;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.safety.application.AiSafetyEventService;
import com.date.backend.domain.safety.domain.SafetyCategory;
import com.date.backend.domain.safety.domain.SafetySeverity;
import com.date.backend.domain.safety.dto.AiSafetyEventRequest;
import com.date.backend.domain.safety.repository.SafetyEventRepository;
import com.date.backend.domain.silence.application.AiSilenceEventService;
import com.date.backend.domain.silence.domain.SilenceInterventionStage;
import com.date.backend.domain.silence.dto.AiSilenceEventRequest;
import com.date.backend.domain.silence.repository.SilenceEventRepository;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:ai-session-assist-integration;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false",
		"match.worker.enabled=false",
		"session.realtime.monitor-enabled=false",
		"session.timer.enabled=false"
})
@ActiveProfiles("test")
class AiSessionAssistIntegrationTest {
	private static final LocalDateTime SESSION_TIME =
			LocalDateTime.of(2026, 7, 30, 20, 0);

	@Autowired
	private UserRepository userRepository;
	@Autowired
	private FaceTagCatalogRepository faceTagRepository;
	@Autowired
	private MatchRequestRepository matchRequestRepository;
	@Autowired
	private MatchPairRepository matchPairRepository;
	@Autowired
	private WaitingRoomRepository sessionRepository;
	@Autowired
	private RoomParticipantRepository participantRepository;
	@Autowired
	private WaitingRoomProvisioningService provisioningService;
	@Autowired
	private AiCoachingService coachingService;
	@Autowired
	private AiSilenceEventService silenceEventService;
	@Autowired
	private AiSafetyEventService safetyEventService;
	@Autowired
	private AiCoachingEventRepository coachingEventRepository;
	@Autowired
	private SilenceEventRepository silenceEventRepository;
	@Autowired
	private SafetyEventRepository safetyEventRepository;
	@Autowired
	private TransactionTemplate transactionTemplate;

	@MockitoBean
	private LiveKitRoomManager liveKitRoomManager;

	@Test
	void coachingSilenceAndSafetyEventsShareActiveSessionAndRemainIdempotent() {
		SessionFixture fixture = createInProgressSession();
		String sessionId = fixture.sessionId().toString();
		String userId = fixture.userId().toString();
		String suffix = UUID.randomUUID().toString();
		OffsetDateTime occurredAt = OffsetDateTime.of(
				SESSION_TIME.plusSeconds(1),
				ZoneOffset.ofHours(9)
		);

		var coachingRequest = new AiCoachingRequest(
				"COACHING_REQUESTED",
				1,
				"coach-" + suffix,
				occurredAt,
				"ai-session-worker",
				sessionId,
				userId,
				CoachingType.REACTION_PROMPT,
				"coach.reaction",
				"상대방의 말에 짧게 반응해 보세요.",
				CoachingPriority.MEDIUM,
				"LOW_REACTION",
				0,
				60_000,
				"coach-dedup-" + suffix
		);
		var silenceRequest = new AiSilenceEventRequest(
				"SILENCE_ANALYZED",
				1,
				"silence-" + suffix,
				"ai-session-worker",
				sessionId,
				0,
				15_000,
				15_000,
				occurredAt
		);
		var safetyRequest = new AiSafetyEventRequest(
				"SAFETY_EVENT_DETECTED",
				1,
				"safety-" + suffix,
				"ai-session-worker",
				sessionId,
				userId,
				SafetyCategory.PERSONAL_INFORMATION_REQUEST,
				SafetySeverity.MEDIUM,
				"PERSONAL_INFO_REQUEST",
				"개인정보를 묻는 표현에 주의해 주세요.",
				new BigDecimal("0.91000"),
				"safety-dedup-" + suffix,
				15_000,
				occurredAt
		);

		assertThat(coachingService.receive(coachingRequest).status())
				.isEqualTo("DELIVERED");
		assertThat(silenceEventService.receive(silenceRequest).interventionStage())
				.isEqualTo(SilenceInterventionStage.TOPIC_HINT);
		assertThat(safetyEventService.receive(safetyRequest).status())
				.isEqualTo("DELIVERED");

		assertThat(coachingEventRepository.existsById(coachingRequest.eventId()))
				.isTrue();
		assertThat(silenceEventRepository.existsById(silenceRequest.eventId()))
				.isTrue();
		assertThat(safetyEventRepository.existsById(safetyRequest.eventId()))
				.isTrue();

		assertThat(coachingService.receive(coachingRequest).status())
				.isEqualTo("DUPLICATE");
		assertThat(silenceEventService.receive(silenceRequest).status())
				.isEqualTo("DUPLICATE");
		assertThat(safetyEventService.receive(safetyRequest).status())
				.isEqualTo("DUPLICATE");
		assertThat(coachingEventRepository.count()).isEqualTo(1);
		assertThat(silenceEventRepository.count()).isEqualTo(1);
		assertThat(safetyEventRepository.count()).isEqualTo(1);
	}

	private SessionFixture createInProgressSession() {
		String suffix = UUID.randomUUID().toString().replace("-", "");
		User firstUser = saveUser(suffix, "a", "1");
		User secondUser = saveUser(suffix, "b", "2");
		var faceTag = faceTagRepository
				.findAllByActiveTrueOrderByDisplayOrderAsc()
				.getFirst();
		MatchRequest firstRequest = matchRequestRepository.saveAndFlush(
				new MatchRequest(
						firstUser.getId(),
						(short) 20,
						(short) 40,
						faceTag,
						faceTag,
						SESSION_TIME.minusHours(2)
				)
		);
		MatchRequest secondRequest = matchRequestRepository.saveAndFlush(
				new MatchRequest(
						secondUser.getId(),
						(short) 20,
						(short) 40,
						faceTag,
						faceTag,
						SESSION_TIME.minusHours(2)
				)
		);
		MatchPair pair = new MatchPair(
				firstRequest,
				secondRequest,
				new BigDecimal("25.000"),
				new BigDecimal("25.000"),
				SESSION_TIME.minusHours(1),
				SESSION_TIME,
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
		});
		return new SessionFixture(session.getId(), participants.getFirst().getUserId());
	}

	private User saveUser(String suffix, String marker, String phoneMarker) {
		String compact = suffix.substring(0, 8);
		return userRepository.saveAndFlush(new User(
				"ai-assist-" + compact + marker + "@example.com",
				"password",
				"AI통합" + compact + marker,
				"010" + phoneMarker + suffix.substring(8, 15),
				LocalDate.of(2000, 1, 1)
		));
	}

	private record SessionFixture(Long sessionId, Long userId) {
	}
}
