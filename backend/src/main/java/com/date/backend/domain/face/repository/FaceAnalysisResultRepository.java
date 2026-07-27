package com.date.backend.domain.face.repository;

import com.date.backend.domain.face.domain.FaceAnalysisResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface FaceAnalysisResultRepository extends JpaRepository<FaceAnalysisResult, Long> {

	Optional<FaceAnalysisResult> findFirstByUserIdOrderByAnalyzedAtDescIdDesc(Long userId);

	boolean existsByAnalysisRequest_Id(Long analysisRequestId);
}
