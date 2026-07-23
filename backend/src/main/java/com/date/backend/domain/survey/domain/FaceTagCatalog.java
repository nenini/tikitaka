package com.date.backend.domain.survey.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "face_tag_catalog")
public class FaceTagCatalog {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "face_tag_id")
	private Long id;

	@Column(name = "code", nullable = false, unique = true, length = 50)
	private String code;

	@Column(name = "name", nullable = false, length = 50)
	private String name;

	@Column(name = "description", length = 500)
	private String description;

	@Column(name = "isActive", nullable = false)
	private boolean active;

	@Column(name = "createdAt", nullable = false, insertable = false, updatable = false)
	private LocalDateTime createdAt;

	@Enumerated(EnumType.STRING)
	@Column(name = "applicableGender", nullable = false, length = 20)
	private ApplicableGender applicableGender;

	@Column(name = "displayOrder", nullable = false)
	private Short displayOrder;

	protected FaceTagCatalog() {
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public boolean isActive() {
		return active;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public ApplicableGender getApplicableGender() {
		return applicableGender;
	}

	public Short getDisplayOrder() {
		return displayOrder;
	}
}
