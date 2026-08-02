package com.date.backend.domain.face.domain;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Objects;

@Entity
@Table(name = "user_face_tags")
public class UserFaceTag {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userFaceTagId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "faceTagId", nullable = false)
	private FaceTagCatalog faceTag;

	@Column(name = "relativeScore", precision = 8, scale = 6)
	private BigDecimal relativeScore;

	@Column(name = "rankOrder", nullable = false)
	private short rankOrder;

	@Column(name = "analyzedAt", nullable = false)
	private LocalDateTime analyzedAt;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "faceAnalysisResultId")
	private FaceAnalysisResult faceAnalysisResult;

	protected UserFaceTag() {
	}

	private UserFaceTag(FaceAnalysisResultTag resultTag) {
		FaceAnalysisResultTag source = Objects.requireNonNull(
				resultTag,
				"얼굴상 분석 결과 태그는 필수입니다."
		);
		FaceAnalysisResult result = Objects.requireNonNull(
				source.getResult(),
				"얼굴상 분석 결과는 필수입니다."
		);
		this.userId = result.getUserId();
		this.faceTag = source.getFaceTag();
		this.relativeScore = source.getRelativeScore();
		this.rankOrder = source.getRankOrder();
		this.analyzedAt = result.getAnalyzedAt();
		this.faceAnalysisResult = result;
	}

	public static UserFaceTag from(FaceAnalysisResultTag resultTag) {
		return new UserFaceTag(resultTag);
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

	public BigDecimal getRelativeScore() {
		return relativeScore;
	}

	public short getRankOrder() {
		return rankOrder;
	}

	public LocalDateTime getAnalyzedAt() {
		return analyzedAt;
	}

	public FaceAnalysisResult getFaceAnalysisResult() {
		return faceAnalysisResult;
	}
}
