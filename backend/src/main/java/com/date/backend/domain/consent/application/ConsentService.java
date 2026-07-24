package com.date.backend.domain.consent.application;

import com.date.backend.domain.consent.domain.ConsentType;
import com.date.backend.domain.consent.domain.UserConsent;
import com.date.backend.domain.consent.dto.request.ConsentDecisionRequest;
import com.date.backend.domain.consent.dto.request.SaveUserConsentsRequest;
import com.date.backend.domain.consent.dto.response.ConsentTypeResponse;
import com.date.backend.domain.consent.dto.response.UserConsentStatusResponse;
import com.date.backend.domain.consent.repository.ConsentTypeRepository;
import com.date.backend.domain.consent.repository.UserConsentRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ConsentErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BinaryOperator;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class ConsentService {
	private final ConsentTypeRepository consentTypeRepository;
	private final UserConsentRepository userConsentRepository;
	private final UserRepository userRepository;

	public ConsentService(
			ConsentTypeRepository consentTypeRepository,
			UserConsentRepository userConsentRepository,
			UserRepository userRepository
	) {
		this.consentTypeRepository = consentTypeRepository;
		this.userConsentRepository = userConsentRepository;
		this.userRepository = userRepository;
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

	@Transactional
	public List<UserConsentStatusResponse> saveMyConsents(Long userId, SaveUserConsentsRequest request) {
		List<ConsentDecisionRequest> decisions = request.consents();
		Set<Long> consentTypeIds = decisions.stream()
				.map(ConsentDecisionRequest::consentTypeId)
				.collect(Collectors.toSet());

		if (consentTypeIds.size() != decisions.size()) {
			throw new BusinessException(ConsentErrorCode.DUPLICATE_CONSENT_TYPE);
		}

		Map<Long, ConsentType> activeTypeById = consentTypeRepository
				.findAllByIdInAndActiveTrue(consentTypeIds)
				.stream()
				.collect(Collectors.toMap(ConsentType::getId, consentType -> consentType));

		if (activeTypeById.size() != consentTypeIds.size()) {
			throw new BusinessException(ConsentErrorCode.CONSENT_TYPE_NOT_FOUND);
		}

		Map<Long, UserConsent> existingConsentByTypeId = userConsentRepository
				.findAllByUser_IdAndConsentType_IdIn(userId, consentTypeIds)
				.stream()
				.collect(Collectors.toMap(
						userConsent -> userConsent.getConsentType().getId(),
						userConsent -> userConsent,
						latestConsent()
				));

		User user = userRepository.getReferenceById(userId);
		LocalDateTime decidedAt = LocalDateTime.now();
		List<UserConsent> consents = decisions.stream()
				.map(decision -> {
					UserConsent existingConsent = existingConsentByTypeId.get(decision.consentTypeId());
					if (existingConsent == null) {
						return new UserConsent(
								user,
								activeTypeById.get(decision.consentTypeId()),
								decision.consented(),
								decidedAt
						);
					}
					existingConsent.updateDecision(decision.consented(), decidedAt);
					return existingConsent;
				})
				.toList();

		userConsentRepository.saveAll(consents);

		return consents.stream()
				.map(userConsent -> UserConsentStatusResponse.of(
						userConsent.getConsentType(),
						userConsent
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
