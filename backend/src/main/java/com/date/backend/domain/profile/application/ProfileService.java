package com.date.backend.domain.profile.application;

import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.dto.response.OnboardingStatusResponse;
import com.date.backend.domain.profile.dto.request.ProfileCreateRequest;
import com.date.backend.domain.profile.dto.response.ProfileResponse;
import com.date.backend.domain.profile.dto.request.ProfileUpdateRequest;
import com.date.backend.domain.profile.dto.response.PublicProfileResponse;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.user.domain.KoreanAgeCalculator;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.CommonErrorCode;
import com.date.backend.global.exception.code.ProfileErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

@Service
@Transactional(readOnly = true)
public class ProfileService {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");

	private final ProfileRepository profileRepository;
	private final UserRepository userRepository;

	public ProfileService(ProfileRepository profileRepository, UserRepository userRepository) {
		this.profileRepository = profileRepository;
		this.userRepository = userRepository;
	}

	@Transactional
	public ProfileResponse create(Long userId, ProfileCreateRequest request) {
		validateActiveUser(userId);
		if (profileRepository.existsById(userId)) {
			throw new BusinessException(ProfileErrorCode.PROFILE_ALREADY_EXISTS);
		}

		String nickname = normalizeNickname(request.nickname());
		if (profileRepository.existsByNickname(nickname)) {
			throw new BusinessException(ProfileErrorCode.DUPLICATE_NICKNAME);
		}

		Profile profile = new Profile(
				userId,
				nickname,
				request.gender(),
				normalizeRegionCity(request.regionCity())
		);
		return ProfileResponse.from(profileRepository.save(profile));
	}

	public ProfileResponse getMine(Long userId) {
		return ProfileResponse.from(getProfile(userId));
	}

	@Transactional
	public ProfileResponse update(Long userId, ProfileUpdateRequest request) {
		if (request.hasNoChanges()) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}

		Profile profile = getProfile(userId);
		String nickname = request.nickname() == null
				? profile.getNickname()
				: normalizeNickname(request.nickname());
		Gender gender = request.gender() == null ? profile.getGender() : request.gender();
		String regionCity = request.regionCity() == null
				? profile.getRegionCity()
				: normalizeRegionCity(request.regionCity());

		if (!nickname.equals(profile.getNickname())
				&& profileRepository.existsByNicknameAndUserIdNot(nickname, userId)) {
			throw new BusinessException(ProfileErrorCode.DUPLICATE_NICKNAME);
		}

		profile.update(nickname, gender, regionCity);
		return ProfileResponse.from(profile);
	}

	public PublicProfileResponse getPublicProfile(Long userId) {
		Profile profile = getProfile(userId);
		User user = userRepository.findById(userId)
				.filter(User::isActive)
				.orElseThrow(() -> new BusinessException(ProfileErrorCode.PROFILE_NOT_FOUND));

		int age = KoreanAgeCalculator.calculate(
				user.getBirthDate(),
				LocalDate.now(SERVICE_ZONE_ID)
		);
		return PublicProfileResponse.from(profile, age);
	}

	public OnboardingStatusResponse getOnboardingStatus(Long userId) {
		Profile profile = getProfile(userId);
		return new OnboardingStatusResponse(profile.isOnboardingCompleted());
	}

	@Transactional
	public void markOnboardingCompleted(Long userId) {
		getProfile(userId).completeOnboarding();
	}

	private Profile getProfile(Long userId) {
		return profileRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(ProfileErrorCode.PROFILE_NOT_FOUND));
	}

	private void validateActiveUser(Long userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
	}

	private String normalizeNickname(String nickname) {
		String normalized = nickname.strip();
		if (normalized.length() < 2 || normalized.length() > 30) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
		return normalized;
	}

	private String normalizeRegionCity(String regionCity) {
		String normalized = regionCity.strip();
		if (normalized.isEmpty() || normalized.length() > 50) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
		return normalized;
	}
}
