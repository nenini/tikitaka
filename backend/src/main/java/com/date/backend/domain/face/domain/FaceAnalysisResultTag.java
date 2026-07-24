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
import java.util.Objects;

@Entity
@Table(name = "face_analysis_result_tags")
public class FaceAnalysisResultTag {
	private static final BigDecimal MIN_SCORE = BigDecimal.ZERO;
	private static final BigDecimal MAX_SCORE = BigDecimal.ONE;

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "faceAnalysisResultTagId")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "faceAnalysisResultId", nullable = false)
	private FaceAnalysisResult result;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "faceTagId", nullable = false)
	private FaceTagCatalog faceTag;

	@Column(name = "relativeScore", nullable = false, precision = 8, scale = 6)
	private BigDecimal relativeScore;

	@Column(name = "rankOrder", nullable = false)
	private short rankOrder;

	protected FaceAnalysisResultTag() {
	}

	FaceAnalysisResultTag(
			FaceAnalysisResult result,
			FaceTagCatalog faceTag,
			BigDecimal relativeScore,
			short rankOrder
	) {
		this.result = Objects.requireNonNull(result, "얼굴상 분석 결과는 필수입니다.");
		this.faceTag = Objects.requireNonNull(faceTag, "얼굴상 태그는 필수입니다.");
		this.relativeScore = validateRelativeScore(relativeScore);
		if (rankOrder <= 0) {
			throw new IllegalArgumentException("얼굴상 순위는 1 이상이어야 합니다.");
		}
		this.rankOrder = rankOrder;
	}

	private static BigDecimal validateRelativeScore(BigDecimal relativeScore) {
		if (relativeScore == null) {
			throw new IllegalArgumentException("얼굴상 상대 점수는 필수입니다.");
		}
		if (relativeScore.compareTo(MIN_SCORE) < 0
				|| relativeScore.compareTo(MAX_SCORE) > 0) {
			throw new IllegalArgumentException("얼굴상 상대 점수는 0 이상 1 이하여야 합니다.");
		}
		if (relativeScore.scale() > 6) {
			throw new IllegalArgumentException("얼굴상 상대 점수는 소수점 6자리 이하여야 합니다.");
		}
		return relativeScore;
	}

	public Long getId() {
		return id;
	}

	public FaceAnalysisResult getResult() {
		return result;
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
}
