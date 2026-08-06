package com.date.backend.domain.room.application;

import com.date.backend.domain.mission.application.SessionMissionProvisioningService;
import com.date.backend.domain.moderation.application.UserRestrictionPolicy;
import com.date.backend.domain.room.config.RoomEntryProperties;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.SessionConnectionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.dto.request.SessionAnalysisSettingsRequest;
import com.date.backend.domain.room.event.AiSessionStartedEvent;
import com.date.backend.domain.room.integration.LiveKitAiWorkerTokenIssuer;
import com.date.backend.domain.room.integration.LiveKitParticipantTokenIssuer;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.SessionErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionLifecycleServiceTest {
	private static final Long SESSION_ID = 15L;
	private static final Long USER_A_ID = 101L;
	private static final LocalDateTime NOW =
			LocalDateTime.of(2026, 7, 30, 19, 0);

	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private LiveKitParticipantTokenIssuer tokenIssuer;
	private LiveKitAiWorkerTokenIssuer aiWorkerTokenIssuer;
	private SessionMissionProvisioningService missionProvisioningService;
	private ApplicationEventPublisher eventPublisher;
	private SessionLifecycleService service;
	private UserRestrictionPolicy restrictionPolicy;
	private WaitingRoom session;
	private RoomParticipant participantA;
	private RoomParticipant participantB;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		tokenIssuer = mock(LiveKitParticipantTokenIssuer.class);
		aiWorkerTokenIssuer = mock(LiveKitAiWorkerTokenIssuer.class);
		missionProvisioningService =
				mock(SessionMissionProvisioningService.class);
		eventPublisher = mock(ApplicationEventPublisher.class);
		restrictionPolicy = mock(UserRestrictionPolicy.class);
		service = new SessionLifecycleService(
				sessionRepository,
				participantRepository,
				new RoomEntryProperties(
						Duration.ofMinutes(10),
						Duration.ofMinutes(10)
				),
				tokenIssuer,
				aiWorkerTokenIssuer,
				missionProvisioningService,
				eventPublisher,
				Clock.fixed(
						Instant.parse("2026-07-30T10:00:00Z"),
						ZoneId.of("Asia/Seoul")
				),
				restrictionPolicy
		);
		session = mock(WaitingRoom.class);
		participantA = mock(RoomParticipant.class);
		participantB = mock(RoomParticipant.class);
		when(session.getId()).thenReturn(SESSION_ID);
		when(session.getScheduledStartAt()).thenReturn(NOW);
		when(session.getLivekitRoomName()).thenReturn("date-room-30");
		when(session.getPlannedDurationSec()).thenReturn(1800);
		when(sessionRepository.findWithMatchPairByIdForUpdate(SESSION_ID))
				.thenReturn(Optional.of(session));
		when(sessionRepository.findWithMatchPairById(SESSION_ID))
				.thenReturn(Optional.of(session));
		when(participantRepository.findByRoomIdAndUserIdForUpdate(
				SESSION_ID,
				USER_A_ID
		)).thenReturn(Optional.of(participantA));
		when(participantRepository.existsByRoom_IdAndUserId(
				SESSION_ID,
				USER_A_ID
		)).thenReturn(true);
		when(participantRepository.findAllByRoom_IdOrderByUserIdAsc(SESSION_ID))
				.thenReturn(List.of(participantA, participantB));
		when(participantA.getUserId()).thenReturn(USER_A_ID);
		when(participantB.getUserId()).thenReturn(102L);
		when(participantA.getConnectionStatus())
				.thenReturn(SessionConnectionStatus.CONNECTED);
		when(participantB.getConnectionStatus())
				.thenReturn(SessionConnectionStatus.CONNECTED);
		when(tokenIssuer.issue(USER_A_ID, "date-room-30"))
				.thenReturn(new LiveKitParticipantTokenIssuer.IssuedLiveKitToken(
						true,
						"https://livekit.example",
						"token"
				));
		when(aiWorkerTokenIssuer.issue(SESSION_ID, "date-room-30"))
				.thenReturn(new LiveKitAiWorkerTokenIssuer.IssuedAiWorkerToken(
						true,
						"wss://livekit.example",
						"date-room-30",
						"ai-session-15",
						"ai-worker-token"
				));
	}

	@Test
	void participantJoinsWithinAllowedTimeAndReceivesLiveKitToken() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);
		when(participantA.recordJoin(NOW)).thenReturn(true);
		when(participantA.getJoinedAt()).thenReturn(NOW);

		var response = service.join(USER_A_ID, SESSION_ID);

		assertThat(response.alreadyJoined()).isFalse();
		assertThat(response.liveKitConfigured()).isTrue();
		assertThat(response.liveKitAccessToken()).isEqualTo("token");
	}

	@Test
	void participantCanJoinBeforeOtherParticipantIsReady() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.WAITING);
		when(participantA.recordJoin(NOW)).thenReturn(true);
		when(participantA.getJoinedAt()).thenReturn(NOW);

		var response = service.join(USER_A_ID, SESSION_ID);

		assertThat(response.alreadyJoined()).isFalse();
		assertThat(response.joinedAt()).isEqualTo(NOW);
		assertThat(response.liveKitAccessToken()).isEqualTo("token");
	}

	@Test
	void joinOutsideAllowedTimeIsRejected() {
		when(session.getScheduledStartAt()).thenReturn(NOW.plusHours(1));
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);

		assertThatThrownBy(() -> service.join(USER_A_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_JOIN_TIME_NOT_ALLOWED
						)
				);
	}

	@Test
	void duplicateJoinKeepsOriginalJoinAndReturnsIdempotentResult() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);
		when(participantA.isJoined()).thenReturn(true);
		when(participantA.recordJoin(NOW)).thenReturn(false);
		when(participantA.getJoinedAt()).thenReturn(NOW.minusMinutes(1));

		var response = service.join(USER_A_ID, SESSION_ID);

		assertThat(response.alreadyJoined()).isTrue();
		assertThat(response.joinedAt()).isEqualTo(NOW.minusMinutes(1));
	}

	@Test
	void nonParticipantCannotJoin() {
		when(participantRepository.findByRoomIdAndUserIdForUpdate(
				SESSION_ID,
				999L
		)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.join(999L, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_NOT_PARTICIPANT
						)
				);
	}

	@Test
	void participantUpdatesAnalysisSettingsBeforeSessionStarts() {
		when(session.isInProgress()).thenReturn(false);
		when(session.isEnded()).thenReturn(false);
		when(participantA.isVoiceAnalysisEnabled()).thenReturn(true);
		when(participantA.isExpressionAnalysisEnabled()).thenReturn(true);

		var response = service.updateAnalysisSettings(
				USER_A_ID,
				SESSION_ID,
				new SessionAnalysisSettingsRequest(true, true)
		);

		verify(participantA).updateAnalysisSettings(true, true);
		assertThat(response.sessionId()).isEqualTo(SESSION_ID);
		assertThat(response.userId()).isEqualTo(USER_A_ID);
		assertThat(response.voiceAnalysisEnabled()).isTrue();
		assertThat(response.expressionAnalysisEnabled()).isTrue();
	}

	@Test
	void analysisSettingsCannotChangeAfterSessionStarts() {
		when(session.isInProgress()).thenReturn(true);

		assertThatThrownBy(() -> service.updateAnalysisSettings(
				USER_A_ID,
				SESSION_ID,
				new SessionAnalysisSettingsRequest(true, true)
		)).isInstanceOfSatisfying(BusinessException.class, exception ->
				assertThat(exception.getErrorCode()).isEqualTo(
						SessionErrorCode.SESSION_STATE_CONFLICT
				)
		);
	}

	@Test
	void startsOnlyWhenBothParticipantsJoinedAndReady() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);
		when(session.isInProgress()).thenReturn(false);
		when(participantA.isJoined()).thenReturn(true);
		when(participantB.isJoined()).thenReturn(true);
		when(participantA.isReady()).thenReturn(true);
		when(participantB.isReady()).thenReturn(true);

		service.start(USER_A_ID, SESSION_ID);

		verify(session).start(NOW);
		verify(missionProvisioningService).provision(
				session,
				List.of(participantA, participantB),
				NOW
		);
		verify(eventPublisher).publishEvent(
				any(AiSessionStartedEvent.class)
		);
		verify(aiWorkerTokenIssuer).issue(
				eq(SESSION_ID),
				eq("date-room-30")
		);
	}

	@Test
	void startBeforeBothParticipantsJoinIsRejected() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);
		when(session.isInProgress()).thenReturn(false);
		when(participantA.isJoined()).thenReturn(true);
		when(participantB.isJoined()).thenReturn(false);

		assertThatThrownBy(() -> service.start(USER_A_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_PARTICIPANTS_NOT_JOINED
						)
				);
	}

	@Test
	void startBeforeBothParticipantsAreReadyIsRejected() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);
		when(session.isInProgress()).thenReturn(false);
		when(participantA.isJoined()).thenReturn(true);
		when(participantB.isJoined()).thenReturn(true);
		when(participantA.isReady()).thenReturn(true);
		when(participantB.isReady()).thenReturn(false);

		assertThatThrownBy(() -> service.start(USER_A_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_PARTICIPANTS_NOT_READY
						)
				);
	}

	@Test
	void startBeforeBothParticipantsConnectToLiveKitIsRejected() {
		when(session.getStatus()).thenReturn(RoomSessionStatus.READY);
		when(session.isInProgress()).thenReturn(false);
		when(participantA.isJoined()).thenReturn(true);
		when(participantB.isJoined()).thenReturn(true);
		when(participantA.isReady()).thenReturn(true);
		when(participantB.isReady()).thenReturn(true);
		when(participantB.getConnectionStatus())
				.thenReturn(SessionConnectionStatus.DISCONNECTED);

		assertThatThrownBy(() -> service.start(USER_A_ID, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode
										.SESSION_PARTICIPANTS_NOT_CONNECTED
						)
				);
	}

	@Test
	void nonParticipantCannotReadStatus() {
		when(participantRepository.existsByRoom_IdAndUserId(
				SESSION_ID,
				999L
		)).thenReturn(false);

		assertThatThrownBy(() -> service.getStatus(999L, SESSION_ID))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								SessionErrorCode.SESSION_NOT_PARTICIPANT
						)
				);
	}
}
