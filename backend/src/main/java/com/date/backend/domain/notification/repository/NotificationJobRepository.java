package com.date.backend.domain.notification.repository;

import com.date.backend.domain.notification.domain.NotificationJob;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationJobRepository extends JpaRepository<NotificationJob, Long> {

	boolean existsByDeduplicationKey(String deduplicationKey);
}
