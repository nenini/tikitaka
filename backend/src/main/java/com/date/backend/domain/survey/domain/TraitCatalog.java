package com.date.backend.domain.survey.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
		name = "trait_catalog",
		uniqueConstraints = @UniqueConstraint(
				name = "UK_trait_catalog_type_code",
				columnNames = {"traitType", "code"}
		)
)
public class TraitCatalog {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "traitId")
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(name = "traitType", nullable = false, length = 30)
	private TraitType type;

	@Column(name = "code", nullable = false, length = 50)
	private String code;

	@Column(name = "name", nullable = false, length = 50)
	private String name;

	@Column(name = "isActive", nullable = false)
	private boolean active;

	@Column(name = "displayOrder", nullable = false)
	private Short displayOrder;

	protected TraitCatalog() {
	}

	public Long getId() {
		return id;
	}

	public TraitType getType() {
		return type;
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public boolean isActive() {
		return active;
	}

	public Short getDisplayOrder() {
		return displayOrder;
	}
}
