package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.user.domain.KoreanAgeCalculator;
import com.date.backend.domain.user.domain.User;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
public class MatchEligibilityPolicy {

	public boolean isEligible(
			MatchRequest first,
			User firstUser,
			Profile firstProfile,
			MatchRequest second,
			User secondUser,
			Profile secondProfile,
			LocalDate referenceDate
	) {
		if (first.getStatus() != MatchRequestStatus.WAITING
				|| second.getStatus() != MatchRequestStatus.WAITING
				|| first.getUserId().equals(second.getUserId())
				|| !firstUser.isActive()
				|| !secondUser.isActive()
				|| firstProfile == null
				|| secondProfile == null
				|| firstProfile.getGender() == secondProfile.getGender()
				|| firstUser.getBirthDate() == null
				|| secondUser.getBirthDate() == null) {
			return false;
		}

		int firstAge = age(firstUser, referenceDate);
		int secondAge = age(secondUser, referenceDate);
		return accepts(first, secondAge) && accepts(second, firstAge);
	}

	private int age(User user, LocalDate referenceDate) {
		return KoreanAgeCalculator.calculate(user.getBirthDate(), referenceDate);
	}

	private boolean accepts(MatchRequest request, int age) {
		return age >= request.getPreferredAgeMin() && age <= request.getPreferredAgeMax();
	}
}
