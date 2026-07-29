package com.date.backend.domain.notification.repository;

import com.date.backend.domain.notification.domain.NotificationJob;
import com.date.backend.domain.notification.domain.NotificationJobStatus;
import com.date.backend.domain.notification.domain.NotificationReferenceType;
import com.date.backend.domain.notification.domain.NotificationType;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface NotificationJobRepository extends JpaRepository<NotificationJob, Long> {

	boolean existsByDeduplicationKey(String deduplicationKey);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT job
			FROM NotificationJob job
			WHERE job.status = :status
			AND job.availableAt <= :now
			ORDER BY job.availableAt, job.id
			""")
	List<NotificationJob> findClaimableForUpdate(
			@Param("status") NotificationJobStatus status,
			@Param("now") LocalDateTime now,
			Pageable pageable
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("SELECT job FROM NotificationJob job WHERE job.id = :jobId")
	Optional<NotificationJob> findByIdForUpdate(@Param("jobId") Long jobId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT job
			FROM NotificationJob job
			WHERE job.status = :status
			AND job.claimedAt <= :claimedBefore
			ORDER BY job.claimedAt, job.id
			""")
	List<NotificationJob> findStaleProcessingForUpdate(
			@Param("status") NotificationJobStatus status,
			@Param("claimedBefore") LocalDateTime claimedBefore,
			Pageable pageable
	);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT job
			FROM NotificationJob job
			WHERE job.referenceType = :referenceType
			AND job.referenceId = :referenceId
			AND job.status = :status
			AND job.type IN :types
			ORDER BY job.id
			""")
	List<NotificationJob> findCancellableForUpdate(
			@Param("referenceType") NotificationReferenceType referenceType,
			@Param("referenceId") Long referenceId,
			@Param("status") NotificationJobStatus status,
			@Param("types") Collection<NotificationType> types
	);
}
