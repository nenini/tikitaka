package com.date.backend.domain.moderation.repository;

import com.date.backend.domain.moderation.domain.UserBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserBlockRepository extends JpaRepository<UserBlock, Long> {
	Optional<UserBlock> findByBlockerUserIdAndBlockedUserId(
			Long blockerUserId,
			Long blockedUserId
	);

	List<UserBlock> findAllByBlockerUserIdOrderByCreatedAtDesc(
			Long blockerUserId
	);

	@Query("""
			select count(block) > 0
			from UserBlock block
			where (block.blockerUserId = :firstUserId
			       and block.blockedUserId = :secondUserId)
			   or (block.blockerUserId = :secondUserId
			       and block.blockedUserId = :firstUserId)
			""")
	boolean existsBlockRelation(
			@Param("firstUserId") Long firstUserId,
			@Param("secondUserId") Long secondUserId
	);
}
