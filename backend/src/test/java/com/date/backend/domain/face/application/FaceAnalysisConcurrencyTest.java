package com.date.backend.domain.face.application;

import com.date.backend.domain.face.domain.FaceAnalysisRequest;
import com.date.backend.domain.face.domain.FaceAnalysisStatus;
import com.date.backend.domain.face.domain.FaceType;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultTagRequest;
import com.date.backend.domain.face.dto.response.FaceAnalysisResultResponse;
import com.date.backend.domain.face.repository.FaceAnalysisRequestRepository;
import com.date.backend.domain.face.repository.FaceAnalysisResultRepository;
import com.date.backend.domain.profile.domain.Gender;
import com.date.backend.domain.profile.domain.Profile;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.FaceErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:face-analysis-concurrency-test;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
		"spring.flyway.enabled=true",
		"spring.flyway.baseline-on-migrate=false",
		"spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class FaceAnalysisConcurrencyTest {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");

	@Autowired
	private FaceAnalysisResultService faceAnalysisResultService;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private ProfileRepository profileRepository;

	@Autowired
	private FaceAnalysisRequestRepository faceAnalysisRequestRepository;

	@Autowired
	private FaceAnalysisResultRepository faceAnalysisResultRepository;

	@Test
	void onlyOneResultIsSavedWhenSameRequestIsSubmittedConcurrently()
			throws Exception {
		User user = userRepository.save(new User(
				"face-concurrency@example.com",
				"password-hash",
				"동시성 사용자",
				null,
				LocalDate.of(2000, 1, 1)
		));
		profileRepository.save(new Profile(
				user.getId(),
				"동시성얼굴",
				Gender.MALE,
				"서울"
		));
		LocalDateTime now = LocalDateTime.now(SERVICE_ZONE_ID);
		FaceAnalysisRequest analysisRequest =
				faceAnalysisRequestRepository.save(new FaceAnalysisRequest(
						user.getId(),
						now.minusMinutes(1),
						now.plusMinutes(9)
				));
		FaceAnalysisResultSubmitRequest request = validRequest();

		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		Callable<Object> submitTask = () -> {
			ready.countDown();
			start.await();
			try {
				return faceAnalysisResultService.submitResult(
						user.getId(),
						analysisRequest.getId(),
						request
				);
			} catch (BusinessException exception) {
				return exception;
			}
		};

		ExecutorService executor = Executors.newFixedThreadPool(2);
		try {
			Future<Object> first = executor.submit(submitTask);
			Future<Object> second = executor.submit(submitTask);
			ready.await();
			start.countDown();

			List<Object> outcomes = List.of(first.get(), second.get());

			assertThat(outcomes)
					.filteredOn(FaceAnalysisResultResponse.class::isInstance)
					.hasSize(1);
			assertThat(outcomes)
					.filteredOn(BusinessException.class::isInstance)
					.singleElement()
					.satisfies(outcome -> assertThat(
							((BusinessException) outcome).getErrorCode()
					).isEqualTo(FaceErrorCode.ANALYSIS_REQUEST_NOT_PENDING));
		} finally {
			executor.shutdownNow();
		}

		assertThat(faceAnalysisResultRepository.count()).isEqualTo(1);
		assertThat(faceAnalysisRequestRepository.findById(analysisRequest.getId()))
				.get()
				.extracting(FaceAnalysisRequest::getStatus)
				.isEqualTo(FaceAnalysisStatus.COMPLETED);
	}

	private FaceAnalysisResultSubmitRequest validRequest() {
		return new FaceAnalysisResultSubmitRequest(
				"face-type-concurrency-v1",
				List.of(
						new FaceAnalysisResultTagRequest(
								FaceType.DOG,
								new BigDecimal("0.700000"),
								(short) 1
						),
						new FaceAnalysisResultTagRequest(
								FaceType.CAT,
								new BigDecimal("0.300000"),
								(short) 2
						)
				)
		);
	}
}
