package com.date.backend.domain.match.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Objects;

@Entity
@Table(name = "match_request_slots")
public class MatchRequestSlot {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "matchRequestSlotId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "matchRequestId", nullable = false)
	private MatchRequest matchRequest;

	@Enumerated(EnumType.STRING)
	@Column(name = "dayOfWeek", nullable = false, length = 10)
	private DayOfWeek dayOfWeek;

	@Column(name = "startTime", nullable = false)
	private LocalTime startTime;

	@Column(name = "endTime", nullable = false)
	private LocalTime endTime;

	@Column(name = "timezone", nullable = false, length = 50)
	private String timezone = "Asia/Seoul";

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updatedAt", nullable = false)
	private LocalDateTime updatedAt;

	protected MatchRequestSlot() {
	}

	public MatchRequestSlot(
			MatchRequest matchRequest,
			DayOfWeek dayOfWeek,
			LocalTime startTime,
			LocalTime endTime
	) {
		this.matchRequest = Objects.requireNonNull(matchRequest);
		this.dayOfWeek = Objects.requireNonNull(dayOfWeek);
		this.startTime = Objects.requireNonNull(startTime);
		this.endTime = Objects.requireNonNull(endTime);
		validateTimeRange(startTime, endTime);
	}

	public void update(DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime) {
		this.dayOfWeek = Objects.requireNonNull(dayOfWeek);
		this.startTime = Objects.requireNonNull(startTime);
		this.endTime = Objects.requireNonNull(endTime);
		validateTimeRange(startTime, endTime);
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

	private static void validateTimeRange(LocalTime startTime, LocalTime endTime) {
		if (!startTime.isBefore(endTime)) {
			throw new IllegalArgumentException("가능 시간의 종료 시각은 시작 시각보다 늦어야 합니다.");
		}
	}

	public Long getId() {
		return id;
	}

	public MatchRequest getMatchRequest() {
		return matchRequest;
	}

	public DayOfWeek getDayOfWeek() {
		return dayOfWeek;
	}

	public LocalTime getStartTime() {
		return startTime;
	}

	public LocalTime getEndTime() {
		return endTime;
	}

	public String getTimezone() {
		return timezone;
	}
}
