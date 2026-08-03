package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.domain.*;
import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.repository.ModerationReportRepository;
import com.date.backend.domain.room.domain.*;
import com.date.backend.domain.room.repository.*;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.junit.jupiter.api.*;
import org.springframework.context.ApplicationEventPublisher;

import java.time.*;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ModerationReportServiceTest {
	private WaitingRoomRepository sessions;
	private RoomParticipantRepository participants;
	private ModerationReportRepository reports;
	private ApplicationEventPublisher events;
	private ModerationReportService service;
	private WaitingRoom session;

	@BeforeEach
	void setUp() {
		sessions = mock(WaitingRoomRepository.class);
		participants = mock(RoomParticipantRepository.class);
		reports = mock(ModerationReportRepository.class);
		events = mock(ApplicationEventPublisher.class);
		session = mock(WaitingRoom.class);
		when(session.getStatus()).thenReturn(RoomSessionStatus.IN_PROGRESS);
		when(sessions.findWithMatchPairByIdForUpdate(15L)).thenReturn(Optional.of(session));
		when(participants.existsByRoom_IdAndUserId(15L, 1L)).thenReturn(true);
		when(participants.existsByRoom_IdAndUserId(15L, 2L)).thenReturn(true);
		when(reports.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
		service = new ModerationReportService(sessions, participants, reports,
				Clock.fixed(Instant.parse("2026-08-03T05:00:00Z"), ZoneId.of("Asia/Seoul")), events);
	}

	@Test
	void activeSessionReportIsStoredWithoutCallingAiOrAddingEvidence() {
		var response = service.create(1L, request(2L));
		assertThat(response.evidences()).isEmpty();
		verify(reports).saveAndFlush(any());
		verifyNoInteractions(events);
	}

	@Test
	void lateReportRequestsTranscriptAfterCommit() {
		when(session.isEnded()).thenReturn(true);
		service.create(1L, request(2L));
		verify(events).publishEvent(new ModerationTranscriptRequestedEvent(15L));
	}

	@Test
	void invalidParticipantDoesNotCreateReport() {
		when(participants.existsByRoom_IdAndUserId(15L, 1L)).thenReturn(false);
		assertThatThrownBy(() -> service.create(1L, request(2L)))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(ModerationErrorCode.REPORTER_NOT_SESSION_PARTICIPANT));
		verify(reports, never()).saveAndFlush(any());
	}

	private ModerationReportCreateRequest request(Long targetId) {
		return new ModerationReportCreateRequest(15L, targetId,
				ModerationReportReason.HARASSMENT, "상대방이 반복적으로 모욕적인 표현을 사용했습니다.");
	}
}
