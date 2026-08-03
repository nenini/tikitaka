package com.date.backend.domain.moderation.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sanctions")
public class UserSanction {
	@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "sanctionId") private Long id;
	@Column(name = "userId", nullable = false) private Long userId;
	@Column(name = "reportId") private Long reportId;
	@Column(name = "sanctionType", nullable = false, length = 30) private String sanctionType;
	@Column(name = "reason", nullable = false, length = 1000) private String reason;
	@Column(name = "startsAt", nullable = false) private LocalDateTime startsAt;
	@Column(name = "endsAt") private LocalDateTime endsAt;
	@Column(name = "createdBy") private Long createdBy;
	@Column(name = "createdAt", nullable = false, updatable = false) private LocalDateTime createdAt;

	protected UserSanction() {}
	public UserSanction(Long userId, String reason, LocalDateTime startsAt, LocalDateTime endsAt, Long createdBy) {
		this.userId = userId; this.sanctionType = "NO_SHOW"; this.reason = reason;
		this.startsAt = startsAt; this.endsAt = endsAt; this.createdBy = createdBy; this.createdAt = startsAt;
	}
	public Long getId() { return id; }
	public String getSanctionType() { return sanctionType; }
	public String getReason() { return reason; }
	public LocalDateTime getStartsAt() { return startsAt; }
	public LocalDateTime getEndsAt() { return endsAt; }
}
