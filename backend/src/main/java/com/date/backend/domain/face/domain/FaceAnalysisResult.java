package com.date.backend.domain.face.domain;

import com.date.backend.domain.survey.domain.FaceTagCatalog;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "face_analysis_results")
public class FaceAnalysisResult {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "faceAnalysisResultId")
	private Long id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "analysisRequestId", nullable = false, unique = true)
	private FaceAnalysisRequest analysisRequest;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "primaryFaceTagId", nullable = false)
	private FaceTagCatalog primaryFaceTag;

	@Column(name = "modelVersion", nullable = false, length = 100)
	private String modelVersion;

	@Column(name = "analyzedAt", nullable = false)
	private LocalDateTime analyzedAt;

	@OneToMany(
			mappedBy = "result",
			cascade = CascadeType.ALL,
			orphanRemoval = true
	)
	@OrderBy("rankOrder ASC")
	private List<FaceAnalysisResultTag> tags = new ArrayList<>();

	protected FaceAnalysisResult() {
	}

	public FaceAnalysisResult(
			FaceAnalysisRequest analysisRequest,
			Long userId,
			FaceTagCatalog primaryFaceTag,
			String modelVersion,
			LocalDateTime analyzedAt
	) {
		this.analysisRequest = Objects.requireNonNull(
				analysisRequest,
				"얼굴상 분석 요청은 필수입니다."
		);
		this.userId = Objects.requireNonNull(userId, "사용자 ID는 필수입니다.");
		if (!Objects.equals(analysisRequest.getUserId(), userId)) {
			throw new IllegalArgumentException("분석 요청 사용자와 결과 사용자가 일치하지 않습니다.");
		}
		this.primaryFaceTag = Objects.requireNonNull(
				primaryFaceTag,
				"대표 얼굴상은 필수입니다."
		);
		validateSupportedFaceType(primaryFaceTag);
		this.modelVersion = normalizeModelVersion(modelVersion);
		this.analyzedAt = Objects.requireNonNull(analyzedAt, "분석 시각은 필수입니다.");
		if (analyzedAt.isBefore(analysisRequest.getCreatedAt())) {
			throw new IllegalArgumentException("분석 시각은 요청 생성 시각보다 빠를 수 없습니다.");
		}
	}

	public void addTag(FaceTagCatalog faceTag, BigDecimal relativeScore, short rankOrder) {
		Objects.requireNonNull(faceTag, "얼굴상 태그는 필수입니다.");
		validateSupportedFaceType(faceTag);
		validatePrimaryFaceTag(faceTag, rankOrder);

		boolean duplicateFaceTag = tags.stream()
				.anyMatch(tag -> tag.getFaceTag().getCode().equals(faceTag.getCode()));
		if (duplicateFaceTag) {
			throw new IllegalArgumentException("동일한 얼굴상 태그를 중복 저장할 수 없습니다.");
		}

		boolean duplicateRank = tags.stream()
				.anyMatch(tag -> tag.getRankOrder() == rankOrder);
		if (duplicateRank) {
			throw new IllegalArgumentException("동일한 얼굴상 순위를 중복 저장할 수 없습니다.");
		}

		tags.add(new FaceAnalysisResultTag(this, faceTag, relativeScore, rankOrder));
		tags.sort(Comparator.comparingInt(FaceAnalysisResultTag::getRankOrder));
	}

	public void validateTags() {
		if (tags.isEmpty()) {
			throw new IllegalStateException("얼굴상 분석 결과 태그는 한 개 이상이어야 합니다.");
		}

		Set<Short> ranks = new HashSet<>();
		for (FaceAnalysisResultTag tag : tags) {
			ranks.add(tag.getRankOrder());
		}
		for (short expectedRank = 1; expectedRank <= tags.size(); expectedRank++) {
			if (!ranks.contains(expectedRank)) {
				throw new IllegalStateException("얼굴상 분석 결과 순위는 1부터 연속되어야 합니다.");
			}
		}
	}

	private void validatePrimaryFaceTag(FaceTagCatalog faceTag, short rankOrder) {
		boolean isPrimaryFaceTag = primaryFaceTag.getCode().equals(faceTag.getCode());
		if ((rankOrder == 1) != isPrimaryFaceTag) {
			throw new IllegalArgumentException("1순위 얼굴상은 대표 얼굴상과 일치해야 합니다.");
		}
	}

	private static void validateSupportedFaceType(FaceTagCatalog faceTag) {
		try {
			FaceType.valueOf(faceTag.getCode());
		} catch (IllegalArgumentException | NullPointerException exception) {
			throw new IllegalArgumentException("지원하지 않는 얼굴상 코드입니다.", exception);
		}
	}

	private static String normalizeModelVersion(String modelVersion) {
		if (modelVersion == null) {
			throw new IllegalArgumentException("분석 모델 버전은 필수입니다.");
		}
		String normalized = modelVersion.strip();
		if (normalized.isEmpty() || normalized.length() > 100) {
			throw new IllegalArgumentException("분석 모델 버전은 1자 이상 100자 이하여야 합니다.");
		}
		return normalized;
	}

	public Long getId() {
		return id;
	}

	public FaceAnalysisRequest getAnalysisRequest() {
		return analysisRequest;
	}

	public Long getUserId() {
		return userId;
	}

	public FaceTagCatalog getPrimaryFaceTag() {
		return primaryFaceTag;
	}

	public String getModelVersion() {
		return modelVersion;
	}

	public LocalDateTime getAnalyzedAt() {
		return analyzedAt;
	}

	public List<FaceAnalysisResultTag> getTags() {
		return Collections.unmodifiableList(tags);
	}
}
