package com.date.backend.domain.match.domain;

import com.date.backend.domain.survey.domain.TraitCatalog;
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
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "match_request_trait_snapshots")
public class MatchRequestTraitSnapshot {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "matchRequestTraitSnapshotId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "matchRequestId", nullable = false)
	private MatchRequest matchRequest;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "traitId", nullable = false)
	private TraitCatalog trait;

	@Enumerated(EnumType.STRING)
	@Column(name = "snapshotType", nullable = false, length = 20)
	private TraitSnapshotType snapshotType;

	@Column(name = "createdAt", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	protected MatchRequestTraitSnapshot() {
	}

	public MatchRequestTraitSnapshot(
			MatchRequest matchRequest,
			TraitCatalog trait,
			TraitSnapshotType snapshotType
	) {
		this.matchRequest = Objects.requireNonNull(matchRequest);
		this.trait = Objects.requireNonNull(trait);
		this.snapshotType = Objects.requireNonNull(snapshotType);
	}

	@PrePersist
	void prePersist() {
		createdAt = LocalDateTime.now();
	}

	public Long getId() {
		return id;
	}

	public MatchRequest getMatchRequest() {
		return matchRequest;
	}

	public TraitCatalog getTrait() {
		return trait;
	}

	public TraitSnapshotType getSnapshotType() {
		return snapshotType;
	}
}
