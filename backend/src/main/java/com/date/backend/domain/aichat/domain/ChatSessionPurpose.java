package com.date.backend.domain.aichat.domain;

public enum ChatSessionPurpose {
	BEFORE_DATE,
	AFTER_DATE,
	/** 기존 세션 조회 호환용입니다. 신규 세션은 전/후 목적을 사용합니다. */
	@Deprecated
	DATE_PRACTICE
}
