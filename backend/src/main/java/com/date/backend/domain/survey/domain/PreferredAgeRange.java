package com.date.backend.domain.survey.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "user_preferred_age_ranges")
public class PreferredAgeRange extends SurveyAnswerBaseEntity {

	@Id
	@Column(name = "userId", nullable = false)
	private Long userId;

	@Column(name = "minPreferredAge", nullable = false)
	private short minPreferredAge;

	@Column(name = "maxPreferredAge", nullable = false)
	private short maxPreferredAge;

	protected PreferredAgeRange() {
	}

	public PreferredAgeRange(Long userId, short minPreferredAge, short maxPreferredAge) {
		validateAgeRange(minPreferredAge, maxPreferredAge);
		this.userId = userId;
		this.minPreferredAge = minPreferredAge;
		this.maxPreferredAge = maxPreferredAge;
	}

	public void update(short minPreferredAge, short maxPreferredAge) {
		validateAgeRange(minPreferredAge, maxPreferredAge);
		this.minPreferredAge = minPreferredAge;
		this.maxPreferredAge = maxPreferredAge;
	}

	private static void validateAgeRange(short minPreferredAge, short maxPreferredAge) {
		if (minPreferredAge <= 0) {
			throw new IllegalArgumentException("최소 선호 나이는 1 이상이어야 합니다.");
		}
		if (maxPreferredAge < minPreferredAge) {
			throw new IllegalArgumentException("최대 선호 나이는 최소 선호 나이 이상이어야 합니다.");
		}
	}

	public Long getUserId() {
		return userId;
	}

	public short getMinPreferredAge() {
		return minPreferredAge;
	}

	public short getMaxPreferredAge() {
		return maxPreferredAge;
	}
}
