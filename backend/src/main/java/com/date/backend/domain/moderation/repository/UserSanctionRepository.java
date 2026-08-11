package com.date.backend.domain.moderation.repository;

import com.date.backend.domain.moderation.domain.UserSanction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface UserSanctionRepository extends JpaRepository<UserSanction, Long> {
	@Query("""
			select (count(s) > 0) from UserSanction s
			where s.userId = :userId and s.startsAt <= :now
			and (s.endsAt is null or s.endsAt > :now)
			""")
	boolean existsActiveByUserId(@Param("userId") Long userId, @Param("now") LocalDateTime now);

	@Query("""
			select s from UserSanction s where s.userId = :userId
			and s.startsAt <= :now and (s.endsAt is null or s.endsAt > :now)
			order by s.endsAt desc
			""")
	List<UserSanction> findActiveByUserId(@Param("userId") Long userId, @Param("now") LocalDateTime now);
	List<UserSanction> findAllByUserIdOrderByCreatedAtDesc(Long userId);
}
