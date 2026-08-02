package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.repository.MatchPairRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionClientConnectionState;
import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.domain.SessionTerminationReason;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.request.SessionConnectionStateRequest;
import com.date.backend.domain.room.dto.request.SessionHeartbeatRequest;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.domain.room.integration.LiveKitRoomManager;
import com.date.backend.domain.survey.repository.FaceTagCatalogRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:livekit-session-reconnect-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate",
		"match.scheduler.enabled=false",
		"match.worker.enabled=false",
		"session.realtime.monitor-enabled=false",
		"session.timer.enabled=false"
})
@ActiveProfiles("test")
@Import(LiveKitSessionReconnectIntegrationTest.ClockTestConfig.class)
class LiveKitSessionReconnectIntegrationTest {
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final LocalDateTime BASE_TIME =
			LocalDateTime.of(2026, 7, 30, 20, 0);
	private static final AtomicInteger SEQUENCE = new AtomicInteger();

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
	private LiveKitParticipantWebhookProcessor webhookProcessor;

	@Autowired
	private SessionLifecycleService lifecycleService;

	@Autowired
	private SessionRealtimeConnectionService connectionService;

	@Autowired
	private SessionConnectionMonitorService connectionMonitorService;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private MutableTestClock clock;

	@MockitoBean
	private LiveKitRoomManager liveKitRoomManager;

	@BeforeEach
	void setUp() {
		clock.set(BASE_TIME);
		reset(liveKitRoomManager);
	}

	@Test
	void liveKitConnectionRecoversWithinReconnectGracePeriod() {
		SessionFixture fixture = createInProgressSession();
		RoomParticipant first = fixture.firstParticipant();
		String participantSid = "PA_reconnect_" + fixture.sequence();
		String clientInstanceId = "client-" + fixture.sequence();

		connectParticipant(
				fixture.session(),
				first,
				participantSid,
				"joined-reconnect-" + fixture.sequence()
		);
		connectionService.heartbeat(
				first.getUserId(),
				fixture.session().getId(),
				new SessionHeartbeatRequest(
						clientInstanceId,
						participantSid
				)
		);
		connectionService.updateConnectionState(
				first.getUserId(),
				fixture.session().getId(),
				new SessionConnectionStateRequest(
						clientInstanceId,
						participantSid,
						SessionClientConnectionState.RECONNECTING
				)
		);

		clock.advance(Duration.ofSeconds(10));
		connectionService.updateConnectionState(
				first.getUserId(),
				fixture.session().getId(),
				new SessionConnectionStateRequest(
						clientInstanceId,
						participantSid,
						SessionClientConnectionState.RECONNECTED
				)
		);

		RoomParticipant recovered = participant(
				fixture.session().getId(),
				first.getUserId()
		);
		assertThat(recovered.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.CONNECTED);
		assertThat(recovered.getReconnectAttemptCount()).isEqualTo(1);
		assertThat(recovered.getReconnectedAt())
				.isEqualTo(clock.localDateTime());
		assertThat(recovered.getReconnectDeadlineAt()).isNull();
		assertThat(session(fixture.session().getId()).getStatus())
				.isEqualTo(RoomSessionStatus.IN_PROGRESS);
	}

	@Test
	void reconnectTimeoutCancelsSessionAndDeletesLiveKitRoom() {
		SessionFixture fixture = createInProgressSession();
		RoomParticipant first = fixture.firstParticipant();
		String participantSid = "PA_timeout_" + fixture.sequence();

		connectParticipant(
				fixture.session(),
				first,
				participantSid,
				"joined-timeout-" + fixture.sequence()
		);
		clock.advance(Duration.ofSeconds(1));
		webhookProcessor.process(new LiveKitParticipantWebhookCommand(
				"left-timeout-" + fixture.sequence(),
				LiveKitParticipantWebhookCommand.EventType.PARTICIPANT_LEFT,
				fixture.session().getLivekitRoomName(),
				first.getParticipantIdentity(),
				participantSid,
				first.getUserId(),
				clock.localDateTime(),
				clock.localDateTime()
		));

		clock.advance(Duration.ofSeconds(21));
		assertThat(connectionMonitorService.failExpiredRecoveries())
				.isEqualTo(1);

		WaitingRoom terminated = session(fixture.session().getId());
		RoomParticipant disconnected = participant(
				fixture.session().getId(),
				first.getUserId()
		);
		assertThat(terminated.getStatus())
				.isEqualTo(RoomSessionStatus.CANCELLED);
		assertThat(terminated.getActualEndAt())
				.isEqualTo(clock.localDateTime());
		assertThat(terminated.getTerminationReason())
				.isEqualTo(SessionTerminationReason.RECONNECT_TIMEOUT.name());
		assertThat(disconnected.getConnectionStatus())
				.isEqualTo(SessionConnectionStatus.DISCONNECTED);
		assertThat(disconnected.getRecoveryFailedAt())
				.isEqualTo(clock.localDateTime());
		verify(liveKitRoomManager).deleteRoom(
				fixture.session().getLivekitRoomName()
		);
	}

	private SessionFixture createInProgressSession() {
		int sequence = SEQUENCE.incrementAndGet();
		User firstUser = saveUser(sequence, "a");
		User secondUser = saveUser(sequence, "b");
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
						BASE_TIME.minusHours(2)
				)
		);
		MatchRequest secondRequest = matchRequestRepository.saveAndFlush(
				new MatchRequest(
						secondUser.getId(),
						(short) 20,
						(short) 40,
						faceTag,
						faceTag,
						BASE_TIME.minusHours(2)
				)
		);
		MatchPair pair = new MatchPair(
				firstRequest,
				secondRequest,
				new BigDecimal("25.000"),
				new BigDecimal("25.000"),
				BASE_TIME.minusHours(1),
				BASE_TIME,
				BASE_TIME.minusHours(2)
		);
		pair.confirm(BASE_TIME.minusMinutes(90));
		pair = matchPairRepository.saveAndFlush(pair);
		provisioningService.provision(pair);

		WaitingRoom createdSession = sessionRepository
				.findByMatchPair_Id(pair.getId())
				.orElseThrow();
		List<RoomParticipant> participants =
				participantRepository.findAllByRoom_IdOrderByUserIdAsc(
						createdSession.getId()
				);
		transactionTemplate.executeWithoutResult(status -> {
			WaitingRoom managedSession = sessionRepository
					.findWithMatchPairByIdForUpdate(createdSession.getId())
					.orElseThrow();
			List<RoomParticipant> managedParticipants =
					participantRepository.findAllByRoom_IdOrderByUserIdAsc(
							managedSession.getId()
					);
			managedParticipants.forEach(participant -> {
				participant.recordJoin(BASE_TIME.minusMinutes(1));
				participant.markReady();
			});
			managedSession.markWaiting();
			managedSession.markReady();
		});

		participants = participantRepository
				.findAllByRoom_IdOrderByUserIdAsc(createdSession.getId());
		connectParticipant(
				createdSession,
				participants.get(0),
				"PA_initial_a_" + sequence,
				"joined-initial-a-" + sequence
		);
		connectParticipant(
				createdSession,
				participants.get(1),
				"PA_initial_b_" + sequence,
				"joined-initial-b-" + sequence
		);
		lifecycleService.start(
				participants.get(0).getUserId(),
				createdSession.getId()
		);
		return new SessionFixture(
				sequence,
				session(createdSession.getId()),
				participant(
						createdSession.getId(),
						participants.get(0).getUserId()
				)
		);
	}

	private void connectParticipant(
			WaitingRoom session,
			RoomParticipant participant,
			String participantSid,
			String eventId
	) {
		webhookProcessor.process(new LiveKitParticipantWebhookCommand(
				eventId,
				LiveKitParticipantWebhookCommand.EventType.PARTICIPANT_JOINED,
				session.getLivekitRoomName(),
				participant.getParticipantIdentity(),
				participantSid,
				participant.getUserId(),
				clock.localDateTime(),
				clock.localDateTime()
		));
	}

	private User saveUser(int sequence, String suffix) {
		String digits = String.format("%07d", sequence);
		return userRepository.saveAndFlush(new User(
				"livekit-" + sequence + suffix + "@example.com",
				"password",
				"통합테스트" + sequence + suffix,
				"010" + ("a".equals(suffix) ? "1" : "2") + digits,
				LocalDate.of(2000, 1, 1)
		));
	}

	private WaitingRoom session(Long sessionId) {
		return sessionRepository.findWithMatchPairById(sessionId).orElseThrow();
	}

	private RoomParticipant participant(Long sessionId, Long userId) {
		return participantRepository.findAllByRoom_IdOrderByUserIdAsc(sessionId)
				.stream()
				.filter(value -> value.getUserId().equals(userId))
				.findFirst()
				.orElseThrow();
	}

	private record SessionFixture(
			int sequence,
			WaitingRoom session,
			RoomParticipant firstParticipant
	) {
	}

	@TestConfiguration
	static class ClockTestConfig {
		@Bean
		@Primary
		MutableTestClock mutableTestClock() {
			return new MutableTestClock(BASE_TIME, SEOUL);
		}
	}

	static final class MutableTestClock extends Clock {
		private final ZoneId zone;
		private final AtomicReference<Instant> instant;

		private MutableTestClock(LocalDateTime initialTime, ZoneId zone) {
			this.zone = zone;
			this.instant = new AtomicReference<>(
					initialTime.atZone(zone).toInstant()
			);
		}

		void set(LocalDateTime time) {
			instant.set(time.atZone(zone).toInstant());
		}

		void advance(Duration duration) {
			instant.updateAndGet(value -> value.plus(duration));
		}

		LocalDateTime localDateTime() {
			return LocalDateTime.ofInstant(instant(), zone);
		}

		@Override
		public ZoneId getZone() {
			return zone;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return Clock.fixed(instant(), zone);
		}

		@Override
		public Instant instant() {
			return instant.get();
		}
	}
}
