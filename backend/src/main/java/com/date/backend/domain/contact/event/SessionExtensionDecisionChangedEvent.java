package com.date.backend.domain.contact.event;

import com.date.backend.domain.contact.dto.response.SessionExtensionDecisionResponse;

public record SessionExtensionDecisionChangedEvent(
		SessionExtensionDecisionResponse payload
) {
}
