package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchRequestSlot;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;

@Component
public class MatchAvailabilityPolicy {

	private static final Duration SESSION_DURATION = Duration.ofMinutes(30);
	private static final int HORIZON_DAYS = 7;

	public Optional<LocalDateTime> findEarliestStart(
			Collection<MatchRequestSlot> firstSlots,
			Collection<MatchRequestSlot> secondSlots,
			LocalDateTime earliestStart
	) {
		LocalDateTime normalizedStart = ceilToMinute(earliestStart);
		LocalDateTime horizonEnd = normalizedStart.plusDays(HORIZON_DAYS);

		return firstSlots.stream()
				.flatMap(first -> secondSlots.stream()
						.filter(second -> first.getDayOfWeek() == second.getDayOfWeek())
						.map(second -> intersectionStart(
								first,
								second,
								normalizedStart,
								horizonEnd
						)))
				.flatMap(Optional::stream)
				.min(Comparator.naturalOrder());
	}

	private Optional<LocalDateTime> intersectionStart(
			MatchRequestSlot first,
			MatchRequestSlot second,
			LocalDateTime earliestStart,
			LocalDateTime horizonEnd
	) {
		LocalTime commonStart = later(first.getStartTime(), second.getStartTime());
		LocalTime commonEnd = earlier(first.getEndTime(), second.getEndTime());
		if (commonStart.plus(SESSION_DURATION).isAfter(commonEnd)) {
			return Optional.empty();
		}

		for (int dayOffset = 0; dayOffset <= HORIZON_DAYS; dayOffset++) {
			LocalDate date = earliestStart.toLocalDate().plusDays(dayOffset);
			if (date.getDayOfWeek() != first.getDayOfWeek()) {
				continue;
			}
			LocalDateTime candidate = date.atTime(commonStart);
			if (candidate.isBefore(earliestStart)) {
				candidate = earliestStart;
			}
			LocalDateTime candidateEnd = candidate.plus(SESSION_DURATION);
			LocalDateTime intervalEnd = date.atTime(commonEnd);
			if (!candidateEnd.isAfter(intervalEnd) && !candidateEnd.isAfter(horizonEnd)) {
				return Optional.of(candidate);
			}
		}
		return Optional.empty();
	}

	private LocalDateTime ceilToMinute(LocalDateTime value) {
		LocalDateTime truncated = value.truncatedTo(ChronoUnit.MINUTES);
		return truncated.equals(value) ? truncated : truncated.plusMinutes(1);
	}

	private LocalTime later(LocalTime first, LocalTime second) {
		return first.isAfter(second) ? first : second;
	}

	private LocalTime earlier(LocalTime first, LocalTime second) {
		return first.isBefore(second) ? first : second;
	}
}
