package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.domain.ModerationReport;
import com.date.backend.domain.moderation.domain.ModerationReportReason;
import com.date.backend.domain.moderation.domain.ReportEvidenceType;
import com.date.backend.domain.moderation.dto.request.ModerationReportCreateRequest;
import com.date.backend.domain.moderation.dto.request.ReportEvidenceRequest;
import com.date.backend.domain.moderation.repository.ModerationReportRepository;
import com.date.backend.domain.room.domain.RoomSessionStatus;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ModerationReportServiceTest {
	private WaitingRoomRepository sessionRepository;
	private RoomParticipantRepository participantRepository;
	private ModerationReportRepository reportRepository;
	private ModerationReportService service;
	private WaitingRoom session;

	@BeforeEach
	void setUp() {
		sessionRepository = mock(WaitingRoomRepository.class);
		participantRepository = mock(RoomParticipantRepository.class);
		reportRepository = mock(ModerationReportRepository.class);
		session = mock(WaitingRoom.class);
		when(session.getStatus()).thenReturn(RoomSessionStatus.IN_PROGRESS);
		when(sessionRepository.findWithMatchPairByIdForUpdate(15L))
				.thenReturn(Optional.of(session));
		when(participantRepository.existsByRoom_IdAndUserId(15L, 1L))
				.thenReturn(true);
		when(participantRepository.existsByRoom_IdAndUserId(15L, 2L))
				.thenReturn(true);
		when(reportRepository.saveAndFlush(any(ModerationReport.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
		service = new ModerationReportService(
				sessionRepository,
				participantRepository,
				reportRepository,
				Clock.fixed(
						Instant.parse("2026-08-03T05:00:00Z"),
						ZoneId.of("Asia/Seoul")
				)
		);
	}

	@Test
	void participantCreatesReportWithSessionSnapshotAndEvidence() {
		var response = service.create(1L, request(2L));

		assertThat(response.sessionId()).isEqualTo(15L);
		assertThat(response.reporterUserId()).isEqualTo(1L);
		assertThat(response.reportedUserId()).isEqualTo(2L);
		assertThat(response.reasonCode())
				.isEqualTo(ModerationReportReason.HARASSMENT);
		assertThat(response.sessionStatusSnapshot())
				.isEqualTo(RoomSessionStatus.IN_PROGRESS);
		assertThat(response.reportedAt())
				.isEqualTo(LocalDateTime.of(2026, 8, 3, 14, 0));
		assertThat(response.evidences()).hasSize(1);
		assertThat(response.evidences().getFirst().objectKey())
				.isEqualTo("moderation/session-15/evidence.png");
		verify(reportRepository).saveAndFlush(any(ModerationReport.class));
	}

	@Test
	void nonParticipantCannotCreateReport() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 1L))
				.thenReturn(false);

		assertError(
				() -> service.create(1L, request(2L)),
				ModerationErrorCode.REPORTER_NOT_SESSION_PARTICIPANT
		);
		verify(reportRepository, never()).saveAndFlush(any());
	}

	@Test
	void reportedUserMustBeParticipantInSameSession() {
		when(participantRepository.existsByRoom_IdAndUserId(15L, 2L))
				.thenReturn(false);

		assertError(
				() -> service.create(1L, request(2L)),
				ModerationErrorCode.REPORTED_USER_NOT_SESSION_PARTICIPANT
		);
	}

	@Test
	void duplicateSessionTargetReportIsRejected() {
		when(reportRepository
				.existsBySessionIdAndReporterUserIdAndReportedUserId(
						15L,
						1L,
						2L
				)).thenReturn(true);

		assertError(
				() -> service.create(1L, request(2L)),
				ModerationErrorCode.DUPLICATE_SESSION_REPORT
		);
	}

	@Test
	void selfReportIsRejected() {
		assertError(
				() -> service.create(1L, request(1L)),
				ModerationErrorCode.SELF_REPORT_NOT_ALLOWED
		);
	}

	private ModerationReportCreateRequest request(Long reportedUserId) {
		return new ModerationReportCreateRequest(
				15L,
				reportedUserId,
				ModerationReportReason.HARASSMENT,
				"상대방이 반복적으로 모욕적인 표현을 사용했습니다.",
				List.of(new ReportEvidenceRequest(
						ReportEvidenceType.SCREENSHOT,
						"moderation/session-15/evidence.png",
						"evidence.png",
						"image/png",
						1024,
						LocalDateTime.of(2026, 8, 3, 13, 59)
				))
		);
	}

	private void assertError(
			org.assertj.core.api.ThrowableAssert.ThrowingCallable callable,
			ModerationErrorCode expected
	) {
		assertThatThrownBy(callable)
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(expected)
				);
	}
}
