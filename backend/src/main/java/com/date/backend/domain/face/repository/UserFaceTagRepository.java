package com.date.backend.domain.face.repository;

import com.date.backend.domain.face.domain.UserFaceTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserFaceTagRepository extends JpaRepository<UserFaceTag, Long> {

	List<UserFaceTag> findAllByUserIdOrderByRankOrderAsc(Long userId);

	@Modifying(flushAutomatically = true)
	@Query("""
			DELETE FROM UserFaceTag userFaceTag
			WHERE userFaceTag.userId = :userId
			""")
	int deleteAllByUserId(@Param("userId") Long userId);
}
