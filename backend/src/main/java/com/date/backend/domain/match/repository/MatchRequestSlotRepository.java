package com.date.backend.domain.match.repository;

import com.date.backend.domain.match.domain.MatchRequestSlot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MatchRequestSlotRepository
		extends JpaRepository<MatchRequestSlot, Long> {

	List<MatchRequestSlot> findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(
			Long matchRequestId
	);

	List<MatchRequestSlot> findAllByMatchRequest_IdIn(
			Collection<Long> matchRequestIds
	);

	void deleteAllByMatchRequest_Id(Long matchRequestId);
}
