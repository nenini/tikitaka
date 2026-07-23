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
		name = "user_preferred_face_tags",
		uniqueConstraints = @UniqueConstraint(
				name = "UK_user_preferred_face_tags_user",
				columnNames = "userId"
		)
)
public class PreferredFaceTag extends SurveyAnswerBaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userPreferredFaceTagId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "faceTagId", nullable = false)
	private FaceTagCatalog faceTag;

	protected PreferredFaceTag() {
	}

	public PreferredFaceTag(Long userId, FaceTagCatalog faceTag) {
		this.userId = userId;
		this.faceTag = Objects.requireNonNull(faceTag);
	}

	public void update(FaceTagCatalog faceTag) {
		this.faceTag = Objects.requireNonNull(faceTag);
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public FaceTagCatalog getFaceTag() {
		return faceTag;
	}
}
