package com.date.backend.domain.report.dto.request;

import com.date.backend.domain.report.domain.AnalysisEvidenceType;
import com.date.backend.domain.report.domain.AnalysisRawUnit;
import com.date.backend.domain.report.domain.AnalysisStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public record SessionAnalysisRequest(
		@Schema(description = "AI-BE 요청 JSON 계약 버전입니다. 현재는 1만 허용하며 필드 구조가 변경될 때 증가합니다.", example = "1")
		@Positive int schemaVersion,
		@Schema(description = "분석 결과 버전입니다. 같은 세션의 중복 수신과 재분석 결과를 구분하며 analysis-v{major}.{minor}.{patch} 형식을 사용합니다.", example = "analysis-v1.0.0")
		@NotBlank @Pattern(regexp = "analysis-v\\d+\\.\\d+\\.\\d+") String analysisVersion,
		@Schema(description = "분석 대상 화상 세션의 DB PK입니다. Backend에 실제 존재하는 종료 세션이어야 합니다.", example = "12345")
		@NotNull @Positive Long sessionId,
		@Schema(description = "AI 서버가 분석을 완료한 시각입니다. ISO-8601 오프셋 형식으로 전달합니다.", example = "2026-08-03T17:00:00+09:00")
		@NotNull OffsetDateTime analyzedAt,
		@Schema(description = "참여자별 분석 결과입니다. 일반적인 2인 세션은 두 명, 사람-AI 세션은 한 명이 포함됩니다.")
		@NotEmpty List<@Valid ParticipantAnalysisRequest> participants
) {
	public record ParticipantAnalysisRequest(
			@Schema(description = "분석 결과를 받을 세션 참여자의 사용자 ID입니다.", example = "1001")
			@NotNull @Positive Long userId,
			@Schema(description = "참여자 분석 성공 여부입니다. FAILED이면 axes와 metrics는 null, evidenceSegments는 빈 배열이어야 합니다.", example = "COMPLETED")
			@NotNull AnalysisStatus analysisStatus,
			@Schema(description = "레이더 차트용 6축입니다. flow, question, listening, reaction, balance, nonverbal을 정확히 사용합니다.")
			@Valid Map<@Pattern(regexp = "flow|question|listening|reaction|balance|nonverbal") String,
					@Valid AxisMetricRequest> axes,
			@Schema(description = "점수 산출 전 객관적인 행동 원본 지표입니다.")
			@Valid MetricsRequest metrics,
			@Schema(description = "분석 근거 시간 구간입니다. 1차 연동에서는 빈 배열을 전달할 수 있습니다.")
			@NotNull List<@Valid EvidenceSegmentRequest> evidenceSegments
	) {}

	public record AxisMetricRequest(
			@Schema(description = "측정된 축 점수입니다. 1.00~5.00이며 measured=false이면 null입니다.", example = "4.25")
			@DecimalMin("1.00") @DecimalMax("5.00") BigDecimal score,
			@Schema(description = "해당 축을 신뢰할 수 있게 측정했는지 나타냅니다.", example = "true")
			boolean measured,
			@Schema(description = "점수 환산 전 원시값입니다. measured=false이면 null입니다.", example = "2.5")
			BigDecimal raw,
			@Schema(description = "원시값 단위입니다. measured=false이면 null입니다.", example = "COUNT_PER_30_MINUTES")
			AnalysisRawUnit rawUnit,
			@Schema(description = "점수 또는 측정 부족의 근거를 설명하는 한 줄 문장입니다.", example = "맞장구를 제외한 말 끊기 2회")
			@NotBlank @Size(max = 500) String note
	) {}

	public record MetricsRequest(
			@NotNull @PositiveOrZero Long speakingMs,
			@DecimalMin("0.0") @DecimalMax("1.0") BigDecimal speakingRatio,
			@NotNull @PositiveOrZero Integer longSilenceCount,
			@NotNull @Positive Integer silenceThresholdMs,
			@NotNull @PositiveOrZero Integer interruptionCount,
			@NotNull @PositiveOrZero Integer backchannelCount,
			@NotNull @PositiveOrZero Integer fillerCount,
			@PositiveOrZero Integer questionCount,
			@PositiveOrZero Integer smileEpisodeCount,
			@PositiveOrZero Integer gazeAwayCount,
			@PositiveOrZero Integer faceMissingCount,
			boolean visionMeasured
	) {}

	public record EvidenceSegmentRequest(
			@Schema(description = "참여자 분석 결과 안에서 유일한 근거 ID입니다.", example = "e1")
			@NotBlank @Size(max = 100) String evidenceId,
			@Schema(description = "근거 이벤트 유형입니다.", example = "LONG_SILENCE")
			@NotNull AnalysisEvidenceType eventType,
			@Schema(description = "세션 시작 기준 근거 시작 시각(ms)입니다.", example = "318000")
			@PositiveOrZero long startMs,
			@Schema(description = "세션 시작 기준 근거 종료 시각(ms)입니다.", example = "329500")
			@PositiveOrZero long endMs,
			@Schema(description = "근거 구간에 대한 설명입니다.", example = "11.5초 동안 대화가 이어지지 않았습니다.")
			@NotBlank @Size(max = 500) String description
	) {}
}
