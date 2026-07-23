package com.date.backend.domain.consent.application;

import com.date.backend.domain.consent.domain.ConsentType;
import com.date.backend.domain.consent.domain.UserConsent;
import com.date.backend.domain.consent.dto.response.ConsentTypeResponse;
import com.date.backend.domain.consent.dto.response.UserConsentStatusResponse;
import com.date.backend.domain.consent.repository.ConsentTypeRepository;
import com.date.backend.domain.consent.repository.UserConsentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class ConsentService {
	private final ConsentTypeRepository consentTypeRepository;
	private final UserConsentRepository userConsentRepository;

	public ConsentService(
			ConsentTypeRepository consentTypeRepository,
			UserConsentRepository userConsentRepository
	) {
		this.consentTypeRepository = consentTypeRepository;
		this.userConsentRepository = userConsentRepository;
	}

	public List<ConsentTypeResponse> getActiveConsentTypes() {
		return getActiveTypes().stream()
				.map(ConsentTypeResponse::from)
				.toList();
	}

	public List<UserConsentStatusResponse> getMyConsentStatuses(Long userId) {
		List<ConsentType> activeTypes = getActiveTypes();
		List<Long> activeTypeIds = activeTypes.stream()
				.map(ConsentType::getId)
				.toList();

		Map<Long, UserConsent> consentByTypeId = userConsentRepository
				.findAllByUser_IdAndConsentType_IdIn(userId, activeTypeIds)
				.stream()
				.collect(Collectors.toMap(
						userConsent -> userConsent.getConsentType().getId(),
						userConsent -> userConsent,
						latestConsent()
				));

		return activeTypes.stream()
				.map(consentType -> UserConsentStatusResponse.of(
						consentType,
						consentByTypeId.get(consentType.getId())
				))
				.toList();
	}

	private List<ConsentType> getActiveTypes() {
		return consentTypeRepository.findAllByActiveTrueOrderByIdAsc();
	}

	private BinaryOperator<UserConsent> latestConsent() {
		Comparator<UserConsent> comparator = Comparator.comparing(
				UserConsent::getUpdatedAt,
				Comparator.nullsFirst(LocalDateTime::compareTo)
		);
		return BinaryOperator.maxBy(comparator);
	}
}
