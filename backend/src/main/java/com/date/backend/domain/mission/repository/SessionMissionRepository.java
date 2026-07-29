package com.date.backend.domain.mission.repository;

import com.date.backend.domain.mission.domain.SessionMission;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SessionMissionRepository
		extends JpaRepository<SessionMission, Long> {

	@EntityGraph(attributePaths = "mission")
	List<SessionMission>
	findAllBySession_IdAndUserIdOrderByMission_DisplayOrderAsc(
			Long sessionId,
			Long userId
	);

	boolean existsBySession_Id(Long sessionId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select sessionMission
			from SessionMission sessionMission
			join fetch sessionMission.mission mission
			where sessionMission.session.id = :sessionId
			  and sessionMission.userId = :userId
			  and mission.code = :missionCode
			""")
	Optional<SessionMission> findForUpdate(
			@Param("sessionId") Long sessionId,
			@Param("userId") Long userId,
			@Param("missionCode") String missionCode
	);
}
