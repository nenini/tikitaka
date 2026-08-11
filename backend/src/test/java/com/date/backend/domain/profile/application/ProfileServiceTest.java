package com.date.backend.domain.profile.application;

import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.dto.request.ProfileCreateRequest;
import com.date.backend.domain.profile.dto.response.ProfileResponse;
import com.date.backend.domain.profile.dto.request.ProfileUpdateRequest;
import com.date.backend.domain.profile.dto.response.PublicProfileResponse;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.CommonErrorCode;
import com.date.backend.global.exception.code.ProfileErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProfileServiceTest {
	private static final Long USER_ID = 1L;

	@Mock
	private ProfileRepository profileRepository;

	@Mock
	private UserRepository userRepository;

	private ProfileService profileService;

	@BeforeEach
	void setUp() {
		profileService = new ProfileService(profileRepository, userRepository);
	}

	@Test
	void createProfileKeepsOnboardingIncomplete() {
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(activeUser(LocalDate.of(2000, 1, 1))));
		when(profileRepository.existsById(USER_ID)).thenReturn(false);
		when(profileRepository.existsByNickname("별빛")).thenReturn(false);
		when(profileRepository.save(any(Profile.class))).thenAnswer(invocation -> invocation.getArgument(0));

		ProfileResponse response = profileService.create(
				USER_ID,
				new ProfileCreateRequest(" 별빛 ", Gender.FEMALE, " 서울 ")
		);

		assertThat(response.nickname()).isEqualTo("별빛");
		assertThat(response.gender()).isEqualTo(Gender.FEMALE);
		assertThat(response.regionCity()).isEqualTo("서울");
		assertThat(response.onboardingCompleted()).isFalse();
	}

	@Test
	void createProfileRejectsDuplicateNickname() {
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(activeUser(LocalDate.of(2000, 1, 1))));
		when(profileRepository.existsById(USER_ID)).thenReturn(false);
		when(profileRepository.existsByNickname("별빛")).thenReturn(true);

		BusinessException exception = catchThrowableOfType(
				() -> profileService.create(
						USER_ID,
						new ProfileCreateRequest("별빛", Gender.FEMALE, "서울")
				),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(ProfileErrorCode.DUPLICATE_NICKNAME);
	}

	@Test
	void updateChangesOnlyProvidedFields() {
		Profile profile = new Profile(USER_ID, "기존닉네임", Gender.MALE, "서울");
		when(profileRepository.findById(USER_ID)).thenReturn(Optional.of(profile));

		ProfileResponse response = profileService.update(
				USER_ID,
				new ProfileUpdateRequest(null, Gender.FEMALE, null)
		);

		assertThat(response.nickname()).isEqualTo("기존닉네임");
		assertThat(response.gender()).isEqualTo(Gender.FEMALE);
		assertThat(response.regionCity()).isEqualTo("서울");
	}

	@Test
	void updateRejectsEmptyPatch() {
		BusinessException exception = catchThrowableOfType(
				() -> profileService.update(USER_ID, new ProfileUpdateRequest(null, null, null)),
				BusinessException.class
		);

		assertThat(exception.getErrorCode()).isEqualTo(CommonErrorCode.INVALID_INPUT);
	}

	@Test
	void publicProfileContainsKoreanAgeCalculatedFromBirthYear() {
		LocalDate birthDate = LocalDate.of(2000, 7, 15);
		Profile profile = new Profile(USER_ID, "별빛", Gender.FEMALE, "서울");
		when(profileRepository.findById(USER_ID)).thenReturn(Optional.of(profile));
		when(userRepository.findById(USER_ID)).thenReturn(Optional.of(activeUser(birthDate)));

		PublicProfileResponse response = profileService.getPublicProfile(USER_ID);

		int expectedAge = LocalDate.now(ZoneId.of("Asia/Seoul")).getYear()
				- birthDate.getYear()
				+ 1;
		assertThat(response.nickname()).isEqualTo("별빛");
		assertThat(response.gender()).isEqualTo(Gender.FEMALE);
		assertThat(response.regionCity()).isEqualTo("서울");
		assertThat(response.age()).isEqualTo(expectedAge);
	}

	@Test
	void onboardingIsCompletedOnlyWhenExplicitlyMarked() {
		Profile profile = new Profile(USER_ID, "별빛", Gender.FEMALE, "서울");
		when(profileRepository.findById(USER_ID)).thenReturn(Optional.of(profile));

		assertThat(profileService.getOnboardingStatus(USER_ID).onboardingCompleted()).isFalse();

		profileService.markOnboardingCompleted(USER_ID);

		assertThat(profileService.getOnboardingStatus(USER_ID).onboardingCompleted()).isTrue();
	}

	private User activeUser(LocalDate birthDate) {
		return new User("user@example.com", "password-hash", "사용자", null, birthDate);
	}
}
