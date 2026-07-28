package com.date.backend.domain.notification.repository;

import com.date.backend.domain.notification.domain.Notification;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

	boolean existsByDeduplicationKey(String deduplicationKey);

	@Query("""
			SELECT notification
			FROM Notification notification
			WHERE notification.userId = :userId
			AND (:cursor IS NULL OR notification.id < :cursor)
			ORDER BY notification.id DESC
			""")
	List<Notification> findPageByUserId(
			@Param("userId") Long userId,
			@Param("cursor") Long cursor,
			Pageable pageable
	);

	long countByUserIdAndReadFalse(Long userId);
}
