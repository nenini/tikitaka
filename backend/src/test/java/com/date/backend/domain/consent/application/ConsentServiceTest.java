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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConsentServiceTest {
	private static final Long USER_ID = 1L;

	@Mock
	private ConsentTypeRepository consentTypeRepository;

	@Mock
	private UserConsentRepository userConsentRepository;

	@Mock
	private UserRepository userRepository;

	private ConsentService consentService;

	@BeforeEach
	void setUp() {
		consentService = new ConsentService(
				consentTypeRepository,
				userConsentRepository,
				userRepository
		);
	}

	@Test
	void activeConsentTypesAreReturnedInRepositoryOrder() {
		ConsentType integrated = consentType(
				1L,
				"INTEGRATED_SERVICE_CONSENT",
				"서비스 이용 및 분석 통합 동의",
				"1.0"
		);
		ConsentType faceCapture = consentType(
				2L,
				"FACE_CAPTURE_CONSENT",
				"얼굴 촬영 및 분석 동의",
				"1.0"
		);
		when(consentTypeRepository.findAllByActiveTrueOrderByIdAsc())
				.thenReturn(List.of(integrated, faceCapture));

		List<ConsentTypeResponse> responses = consentService.getActiveConsentTypes();

		assertThat(responses)
				.extracting(ConsentTypeResponse::code)
				.containsExactly("INTEGRATED_SERVICE_CONSENT", "FACE_CAPTURE_CONSENT");
	}

	@Test
	void myConsentStatusesIncludeNotYetConsentedTypes() {
		ConsentType integrated = consentType(
				1L,
				"INTEGRATED_SERVICE_CONSENT",
				"서비스 이용 및 분석 통합 동의",
				"1.0"
		);
		ConsentType faceCapture = consentType(
				2L,
				"FACE_CAPTURE_CONSENT",
				"얼굴 촬영 및 분석 동의",
				"1.0"
		);
		UserConsent integratedConsent = mock(UserConsent.class);
		LocalDateTime consentedAt = LocalDateTime.of(2026, 7, 23, 10, 0);

		when(consentTypeRepository.findAllByActiveTrueOrderByIdAsc())
				.thenReturn(List.of(integrated, faceCapture));
		when(userConsentRepository.findAllByUser_IdAndConsentType_IdIn(USER_ID, List.of(1L, 2L)))
				.thenReturn(List.of(integratedConsent));
		when(integratedConsent.getConsentType()).thenReturn(integrated);
		when(integratedConsent.isConsented()).thenReturn(true);
		when(integratedConsent.getConsentedAt()).thenReturn(consentedAt);

		List<UserConsentStatusResponse> responses = consentService.getMyConsentStatuses(USER_ID);

		assertThat(responses).hasSize(2);
		assertThat(responses.get(0).consented()).isTrue();
		assertThat(responses.get(0).consentedAt()).isEqualTo(consentedAt);
		assertThat(responses.get(1).consented()).isFalse();
		assertThat(responses.get(1).consentedAt()).isNull();
		assertThat(responses.get(1).withdrawnAt()).isNull();
	}

	@Test
	void saveMyConsentsCreatesNewConsentDecisions() {
		ConsentType integrated = consentType(
				1L,
				"INTEGRATED_SERVICE_CONSENT",
				"서비스 이용 및 분석 통합 동의",
				"1.0"
		);
		ConsentType faceCapture = consentType(
				2L,
				"FACE_CAPTURE_CONSENT",
				"얼굴 촬영 및 분석 동의",
				"1.0"
		);
		User user = mock(User.class);
		SaveUserConsentsRequest request = new SaveUserConsentsRequest(List.of(
				new ConsentDecisionRequest(1L, true),
				new ConsentDecisionRequest(2L, false)
		));

		when(consentTypeRepository.findAllByIdInAndActiveTrue(Set.of(1L, 2L)))
				.thenReturn(List.of(integrated, faceCapture));
		when(userConsentRepository.findAllByUser_IdAndConsentType_IdIn(USER_ID, Set.of(1L, 2L)))
				.thenReturn(List.of());
		when(userRepository.getReferenceById(USER_ID)).thenReturn(user);

		List<UserConsentStatusResponse> responses = consentService.saveMyConsents(USER_ID, request);

		assertThat(responses)
				.extracting(UserConsentStatusResponse::consented)
				.containsExactly(true, false);
		assertThat(responses.get(0).consentedAt()).isNotNull();
		assertThat(responses.get(1).consentedAt()).isNull();
		verify(userConsentRepository).saveAll(anyList());
	}

	@Test
	void duplicateConsentTypeIsRejected() {
		SaveUserConsentsRequest request = new SaveUserConsentsRequest(List.of(
				new ConsentDecisionRequest(1L, true),
				new ConsentDecisionRequest(1L, false)
		));

		assertThatThrownBy(() -> consentService.saveMyConsents(USER_ID, request))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ConsentErrorCode.DUPLICATE_CONSENT_TYPE)
				);
		verify(userConsentRepository, never()).saveAll(anyList());
	}

	@Test
	void withdrawMyConsentRecordsWithdrawalWithoutDeletingHistory() {
		ConsentType consentType = consentType(
				2L,
				"FACE_CAPTURE_CONSENT",
				"얼굴 촬영 및 분석 동의",
				"1.0"
		);
		UserConsent userConsent = new UserConsent(
				mock(User.class),
				consentType,
				true,
				LocalDateTime.of(2026, 7, 24, 9, 0)
		);
		when(userConsentRepository.findByUser_IdAndConsentType_Id(USER_ID, 2L))
				.thenReturn(Optional.of(userConsent));

		UserConsentStatusResponse response = consentService.withdrawMyConsent(USER_ID, 2L);

		assertThat(response.consented()).isFalse();
		assertThat(response.consentedAt()).isEqualTo(LocalDateTime.of(2026, 7, 24, 9, 0));
		assertThat(response.withdrawnAt()).isNotNull();
		verify(userConsentRepository).save(userConsent);
	}

	@Test
	void alreadyWithdrawnConsentCannotBeWithdrawnAgain() {
		UserConsent userConsent = new UserConsent(
				mock(User.class),
				mock(ConsentType.class),
				false,
				LocalDateTime.of(2026, 7, 24, 9, 0)
		);
		when(userConsentRepository.findByUser_IdAndConsentType_Id(USER_ID, 2L))
				.thenReturn(Optional.of(userConsent));

		assertThatThrownBy(() -> consentService.withdrawMyConsent(USER_ID, 2L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ConsentErrorCode.CONSENT_ALREADY_WITHDRAWN)
				);
		verify(userConsentRepository, never()).save(userConsent);
	}

	@Test
	void consentWithoutUserHistoryCannotBeWithdrawn() {
		when(userConsentRepository.findByUser_IdAndConsentType_Id(USER_ID, 2L))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> consentService.withdrawMyConsent(USER_ID, 2L))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode())
								.isEqualTo(ConsentErrorCode.USER_CONSENT_NOT_FOUND)
				);
	}

	private ConsentType consentType(Long id, String code, String name, String version) {
		ConsentType consentType = mock(ConsentType.class);
		when(consentType.getId()).thenReturn(id);
		when(consentType.getCode()).thenReturn(code);
		when(consentType.getName()).thenReturn(name);
		when(consentType.getVersion()).thenReturn(version);
		return consentType;
	}
}
