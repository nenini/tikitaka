package com.date.backend.domain.consent.application;

import com.date.backend.domain.consent.domain.ConsentType;
import com.date.backend.domain.consent.domain.UserConsent;
import com.date.backend.domain.consent.dto.response.ConsentTypeResponse;
import com.date.backend.domain.consent.dto.response.UserConsentStatusResponse;
import com.date.backend.domain.consent.repository.ConsentTypeRepository;
import com.date.backend.domain.consent.repository.UserConsentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConsentServiceTest {
	private static final Long USER_ID = 1L;

	@Mock
	private ConsentTypeRepository consentTypeRepository;

	@Mock
	private UserConsentRepository userConsentRepository;

	private ConsentService consentService;

	@BeforeEach
	void setUp() {
		consentService = new ConsentService(consentTypeRepository, userConsentRepository);
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

	private ConsentType consentType(Long id, String code, String name, String version) {
		ConsentType consentType = mock(ConsentType.class);
		when(consentType.getId()).thenReturn(id);
		when(consentType.getCode()).thenReturn(code);
		when(consentType.getName()).thenReturn(name);
		when(consentType.getVersion()).thenReturn(version);
		return consentType;
	}
}
