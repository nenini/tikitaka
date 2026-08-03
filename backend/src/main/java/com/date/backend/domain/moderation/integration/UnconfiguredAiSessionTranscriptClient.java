package com.date.backend.domain.moderation.integration;

import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;

public class UnconfiguredAiSessionTranscriptClient implements AiSessionTranscriptClient {
	@Override
	public boolean configured() { return false; }

	@Override
	public AiSessionTranscript getTranscript(Long sessionId) {
		throw new BusinessException(ModerationErrorCode.AI_TRANSCRIPT_NOT_CONFIGURED);
	}
}
