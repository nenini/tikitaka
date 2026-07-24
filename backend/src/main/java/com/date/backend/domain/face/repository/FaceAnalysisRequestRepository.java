package com.date.backend.domain.face.repository;

import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface FaceAnalysisRequestRepository extends JpaRepository<FaceAnalysisRequest, Long> {

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			SELECT analysisRequest
			FROM FaceAnalysisRequest analysisRequest
			WHERE analysisRequest.id = :analysisRequestId
			""")
	Optional<FaceAnalysisRequest> findByIdForUpdate(
			@Param("analysisRequestId") Long analysisRequestId
	);
}
