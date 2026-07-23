package com.date.backend.domain.survey.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.util.Objects;

@Entity
@Table(
		name = "user_traits",
		uniqueConstraints = @UniqueConstraint(
				name = "UK_user_traits_user_trait",
				columnNames = {"userId", "traitId"}
		)
)
public class UserTrait extends SurveyAnswerBaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userTraitId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "traitId", nullable = false)
	private TraitCatalog trait;

	protected UserTrait() {
	}

	public UserTrait(Long userId, TraitCatalog trait) {
		this.userId = userId;
		this.trait = Objects.requireNonNull(trait);
	}

	public void update(TraitCatalog trait) {
		this.trait = Objects.requireNonNull(trait);
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public TraitCatalog getTrait() {
		return trait;
	}
}
