package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.dto.response.UserRestrictionStatusResponse;
import com.date.backend.domain.moderation.repository.AttendancePenaltyRepository;
import com.date.backend.domain.moderation.repository.UserSanctionRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;

import static com.date.backend.domain.moderation.dto.response.RestrictionItemResponse.from;

@Service
@Transactional(readOnly = true)
public class UserRestrictionPolicy {
	private final UserSanctionRepository sanctionRepository;
	private final AttendancePenaltyRepository penaltyRepository;
	private final Clock clock;

	public UserRestrictionPolicy(UserSanctionRepository sanctionRepository,
			AttendancePenaltyRepository penaltyRepository, Clock clock) {
		this.sanctionRepository = sanctionRepository;
		this.penaltyRepository = penaltyRepository;
		this.clock = clock;
	}

	public void assertNotRestricted(Long userId) {
		if (sanctionRepository.existsActiveByUserId(userId, LocalDateTime.now(clock))) {
			throw new BusinessException(ModerationErrorCode.USER_RESTRICTED);
		}
	}

	public UserRestrictionStatusResponse getStatus(Long userId) {
		var active = sanctionRepository.findActiveByUserId(userId, LocalDateTime.now(clock));
		return new UserRestrictionStatusResponse(!active.isEmpty(),
				penaltyRepository.countByUserIdAndPenaltyType(userId, "NO_SHOW"),
				active.stream().map(restriction -> from(restriction)).toList());
	}
}
