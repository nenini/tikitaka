package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum MatchErrorCode implements ErrorCode {
	MATCH_REQUEST_ALREADY_ACTIVE(
			HttpStatus.CONFLICT,
			"MATCH_REQUEST_ALREADY_ACTIVE",
			"이미 진행 중인 매칭 요청이 있습니다."
	),
	MATCH_REQUEST_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"MATCH_REQUEST_NOT_FOUND",
			"진행 중인 매칭 요청을 찾을 수 없습니다."
	),
	MATCH_REQUEST_NOT_WAITING(
			HttpStatus.CONFLICT,
			"MATCH_REQUEST_NOT_WAITING",
			"대기 중인 매칭 요청만 수정하거나 취소할 수 있습니다."
	),
	MATCH_PROFILE_REQUIRED(
			HttpStatus.CONFLICT,
			"MATCH_PROFILE_REQUIRED",
			"매칭을 신청하려면 프로필 등록이 필요합니다."
	),
	MATCH_SURVEY_REQUIRED(
			HttpStatus.CONFLICT,
			"MATCH_SURVEY_REQUIRED",
			"매칭을 신청하려면 설문 완료가 필요합니다."
	),
	MATCH_FACE_ANALYSIS_REQUIRED(
			HttpStatus.CONFLICT,
			"MATCH_FACE_ANALYSIS_REQUIRED",
			"매칭을 신청하려면 얼굴상 분석 완료가 필요합니다."
	),
	INVALID_MATCH_REQUEST(
			HttpStatus.BAD_REQUEST,
			"INVALID_MATCH_REQUEST",
			"유효하지 않은 매칭 신청 조건입니다."
	),
	MATCH_NOT_FOUND(
			HttpStatus.NOT_FOUND,
			"MATCH_NOT_FOUND",
			"매칭 결과를 찾을 수 없습니다."
	),
	MATCH_NOT_PARTICIPANT(
			HttpStatus.FORBIDDEN,
			"MATCH_NOT_PARTICIPANT",
			"해당 매칭의 참여자가 아닙니다."
	),
	MATCH_NOT_RESPONDABLE(
			HttpStatus.CONFLICT,
			"MATCH_NOT_RESPONDABLE",
			"현재 응답할 수 없는 매칭입니다."
	),
	MATCH_RESPONSE_ALREADY_PROCESSED(
			HttpStatus.CONFLICT,
			"MATCH_RESPONSE_ALREADY_PROCESSED",
			"이미 매칭 응답을 완료했습니다."
	),
	MATCH_ACCEPTANCE_DEADLINE_EXPIRED(
			HttpStatus.CONFLICT,
			"MATCH_ACCEPTANCE_DEADLINE_EXPIRED",
			"매칭 수락 제한 시간이 만료되었습니다."
	),
	MATCH_SCHEDULE_NOT_AVAILABLE(
			HttpStatus.CONFLICT,
			"MATCH_SCHEDULE_NOT_AVAILABLE",
			"예약 가능한 공통 시간을 찾을 수 없습니다."
	),
	MATCH_CANCELLATION_NOT_ALLOWED(
			HttpStatus.CONFLICT,
			"MATCH_CANCELLATION_NOT_ALLOWED",
			"확정된 매칭만 취소할 수 있습니다."
	),
	MATCH_SESSION_ALREADY_STARTED(
			HttpStatus.CONFLICT,
			"MATCH_SESSION_ALREADY_STARTED",
			"이미 시작된 매칭은 취소할 수 없습니다."
	);

	private final HttpStatus status;
	private final String code;
	private final String message;

	MatchErrorCode(HttpStatus status, String code, String message) {
		this.status = status;
		this.code = code;
		this.message = message;
	}

	@Override
	public HttpStatus status() {
		return status;
	}

	@Override
	public String code() {
		return code;
	}

	@Override
	public String message() {
		return message;
	}
}
