package com.date.backend.domain.notification.repository;

import com.date.backend.domain.notification.domain.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

	boolean existsByDeduplicationKey(String deduplicationKey);
}
