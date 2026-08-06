package com.date.backend.domain.room.domain;

import com.date.backend.domain.match.domain.MatchPair;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "sessions")
public class WaitingRoom {
	public static final int DEFAULT_PLANNED_DURATION_SECONDS = 13 * 60;
	public static final int BASE_DURATION_SECONDS = 8 * 60;
	public static final int EXTENSION_DURATION_SECONDS = 5 * 60;
	public static final int AI_VIDEO_DURATION_SECONDS = 5 * 60;

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "sessionId")
	private Long id;

	@OneToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "matchPairId", unique = true)
	private MatchPair matchPair;

	@Column(name = "sessionType", nullable = false, length = 20)
	private String sessionType;

	@Column(name = "scenario", length = 20)
	private String scenario;

	@Column(name = "cameraEnabled", nullable = false)
	private boolean cameraEnabled;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 30)
	private RoomSessionStatus status;

	@Column(name = "scheduledStartAt", nullable = false)
	private LocalDateTime scheduledStartAt;

	@Column(name = "actualStartAt")
	private LocalDateTime actualStartAt;

	@Column(name = "actualEndAt")
	private LocalDateTime actualEndAt;

	@Column(name = "plannedDurationSec", nullable = false)
	private int plannedDurationSec;

	@Column(name = "extensionDurationSec", nullable = false)
	private int extensionDurationSec;

	@Column(name = "terminationReason", length = 500)
	private String terminationReason;

	@Column(name = "endedByUserId")
	private Long endedByUserId;

	@Column(name = "livekitRoomName", unique = true, length = 255)
	private String livekitRoomName;

	@Column(name = "ending_soon_notified_at")
	private LocalDateTime endingSoonNotifiedAt;

	@Column(name = "ending_imminent_notified_at")
	private LocalDateTime endingImminentNotifiedAt;

	@Column(name = "timer_expired_notified_at")
	private LocalDateTime timerExpiredNotifiedAt;

	@Column(name = "evaluation_completion_notified_at")
	private LocalDateTime evaluationCompletionNotifiedAt;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected WaitingRoom() {
	}

	public WaitingRoom(MatchPair matchPair) {
		this.matchPair = Objects.requireNonNull(matchPair);
		if (matchPair.getId() == null || matchPair.getScheduledAt() == null) {
			throw new IllegalArgumentException("확정되어 일정이 지정된 매칭만 대기방을 생성할 수 있습니다.");
		}
		this.sessionType = "REAL_DATE";
		this.cameraEnabled = true;
		this.status = RoomSessionStatus.CREATED;
		this.scheduledStartAt = matchPair.getScheduledAt();
		this.plannedDurationSec = DEFAULT_PLANNED_DURATION_SECONDS;
		this.extensionDurationSec = 0;
		this.livekitRoomName = "date-room-" + matchPair.getId();
	}

	public WaitingRoom(
			LocalDateTime scheduledStartAt,
			String scenario,
			boolean cameraEnabled,
			String livekitRoomName
	) {
		this.sessionType = "AI_VIDEO";
		this.status = RoomSessionStatus.CREATED;
		this.scheduledStartAt = Objects.requireNonNull(scheduledStartAt);
		this.scenario = requireAiVideoScenario(scenario);
		this.cameraEnabled = cameraEnabled;
		this.plannedDurationSec = AI_VIDEO_DURATION_SECONDS;
		this.extensionDurationSec = 0;
		this.livekitRoomName = Objects.requireNonNull(livekitRoomName);
	}

	private static String requireAiVideoScenario(String scenario) {
		String value = Objects.requireNonNull(scenario).toLowerCase();
		if (!java.util.Set.of("first_meet", "hobby", "work", "food", "travel").contains(value)) {
			throw new IllegalArgumentException("지원하지 않는 AI 화상 세션 주제입니다.");
		}
		return value;
	}

	@PrePersist
	void prePersist() {
		LocalDateTime now = LocalDateTime.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public MatchPair getMatchPair() {
		return matchPair;
	}

	public String getSessionType() {
		return sessionType;
	}

	public String getScenario() {
		return scenario;
	}

	public boolean isCameraEnabled() {
		return cameraEnabled;
	}

	public boolean isAiVideo() {
		return "AI_VIDEO".equals(sessionType);
	}

	public RoomSessionStatus getStatus() {
		return status;
	}

	public LocalDateTime getScheduledStartAt() {
		return scheduledStartAt;
	}

	public LocalDateTime getActualStartAt() {
		return actualStartAt;
	}

	public LocalDateTime getActualEndAt() {
		return actualEndAt;
	}

	public int getPlannedDurationSec() {
		return plannedDurationSec;
	}

	public int getExtensionDurationSec() {
		return extensionDurationSec;
	}

	public String getTerminationReason() {
		return terminationReason;
	}

	public Long getEndedByUserId() {
		return endedByUserId;
	}

	public String getLivekitRoomName() {
		return livekitRoomName;
	}

	public LocalDateTime expectedEndAt() {
		if (!isInProgress() || actualStartAt == null) {
			throw new IllegalStateException(
					"진행 중인 세션에만 종료 예정 시각이 존재합니다."
			);
		}
		return actualStartAt.plusSeconds(plannedDurationSec);
	}

	public LocalDateTime extensionDecisionDeadlineAt() {
		if (!isInProgress() || actualStartAt == null) {
			throw new IllegalStateException(
					"진행 중인 세션에만 연장 의사 결정 시각이 존재합니다."
			);
		}
		return actualStartAt.plusSeconds(BASE_DURATION_SECONDS);
	}

	public boolean grantExtension() {
		if (!isInProgress()) {
			throw new IllegalStateException(
					"진행 중인 세션만 연장할 수 있습니다."
			);
		}
		if (extensionDurationSec == EXTENSION_DURATION_SECONDS) {
			return false;
		}
		if (extensionDurationSec != 0) {
			throw new IllegalStateException(
					"허용되지 않은 세션 연장 시간입니다."
			);
		}
		extensionDurationSec = EXTENSION_DURATION_SECONDS;
		endingSoonNotifiedAt = null;
		endingImminentNotifiedAt = null;
		timerExpiredNotifiedAt = null;
		return true;
	}

	public LocalDateTime getEndingSoonNotifiedAt() {
		return endingSoonNotifiedAt;
	}

	public LocalDateTime getEndingImminentNotifiedAt() {
		return endingImminentNotifiedAt;
	}

	public LocalDateTime getTimerExpiredNotifiedAt() {
		return timerExpiredNotifiedAt;
	}

	public LocalDateTime getEvaluationCompletionNotifiedAt() {
		return evaluationCompletionNotifiedAt;
	}

	public boolean claimEvaluationCompletion(LocalDateTime notifiedAt) {
		Objects.requireNonNull(notifiedAt);
		if (status != RoomSessionStatus.COMPLETED
				|| evaluationCompletionNotifiedAt != null) {
			return false;
		}
		evaluationCompletionNotifiedAt = notifiedAt;
		return true;
	}

	public boolean claimEndingSoonNotification(LocalDateTime notifiedAt) {
		Objects.requireNonNull(notifiedAt);
		if (!isInProgress() || endingSoonNotifiedAt != null) {
			return false;
		}
		endingSoonNotifiedAt = notifiedAt;
		return true;
	}

	public boolean claimEndingImminentNotification(LocalDateTime notifiedAt) {
		Objects.requireNonNull(notifiedAt);
		if (!isInProgress() || endingImminentNotifiedAt != null) {
			return false;
		}
		if (endingSoonNotifiedAt == null) {
			endingSoonNotifiedAt = notifiedAt;
		}
		endingImminentNotifiedAt = notifiedAt;
		return true;
	}

	public boolean claimTimerExpiredNotification(LocalDateTime notifiedAt) {
		Objects.requireNonNull(notifiedAt);
		if (!isInProgress() || timerExpiredNotifiedAt != null) {
			return false;
		}
		if (endingSoonNotifiedAt == null) {
			endingSoonNotifiedAt = notifiedAt;
		}
		if (endingImminentNotifiedAt == null) {
			endingImminentNotifiedAt = notifiedAt;
		}
		timerExpiredNotifiedAt = notifiedAt;
		return true;
	}

	public void markWaiting() {
		if (status == RoomSessionStatus.CREATED
				|| status == RoomSessionStatus.SCHEDULED
				|| status == RoomSessionStatus.READY) {
			status = RoomSessionStatus.WAITING;
		}
	}

	public void markReady() {
		if (status == RoomSessionStatus.CREATED || status == RoomSessionStatus.WAITING) {
			status = RoomSessionStatus.READY;
		}
	}

	public boolean isInProgress() {
		return status == RoomSessionStatus.IN_PROGRESS;
	}

	public boolean isEnded() {
		return status == RoomSessionStatus.COMPLETED
				|| status == RoomSessionStatus.CANCELLED;
	}

	public void start(LocalDateTime startedAt) {
		if (status != RoomSessionStatus.READY) {
			throw new IllegalStateException("준비 완료된 세션만 시작할 수 있습니다.");
		}
		status = RoomSessionStatus.IN_PROGRESS;
		actualStartAt = Objects.requireNonNull(startedAt);
	}

	public void complete(
			LocalDateTime endedAt,
			SessionTerminationReason reason,
			Long endedByUserId
	) {
		end(
				RoomSessionStatus.COMPLETED,
				endedAt,
				reason,
				endedByUserId
		);
	}

	public void terminate(
			LocalDateTime endedAt,
			SessionTerminationReason reason,
			Long endedByUserId
	) {
		end(
				RoomSessionStatus.CANCELLED,
				endedAt,
				reason,
				endedByUserId
		);
	}

	private void end(
			RoomSessionStatus endStatus,
			LocalDateTime endedAt,
			SessionTerminationReason reason,
			Long endedByUserId
	) {
		if (!isInProgress()) {
			throw new IllegalStateException(
					"진행 중인 세션만 종료할 수 있습니다."
			);
		}
		this.status = Objects.requireNonNull(endStatus);
		this.actualEndAt = Objects.requireNonNull(endedAt);
		this.terminationReason = Objects.requireNonNull(reason).name();
		this.endedByUserId = endedByUserId;
	}
}
