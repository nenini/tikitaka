package com.date.backend.domain.user.domain;

import java.time.LocalDate;
import java.util.Objects;

public final class KoreanAgeCalculator {

	private KoreanAgeCalculator() {
	}

	public static int calculate(LocalDate birthDate, LocalDate referenceDate) {
		Objects.requireNonNull(birthDate);
		Objects.requireNonNull(referenceDate);
		return referenceDate.getYear() - birthDate.getYear() + 1;
	}
}
