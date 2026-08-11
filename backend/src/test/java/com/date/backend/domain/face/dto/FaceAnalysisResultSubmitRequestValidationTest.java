package com.date.backend.domain.face.dto;

import com.date.backend.domain.face.domain.FaceType;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultSubmitRequest;
import com.date.backend.domain.face.dto.request.FaceAnalysisResultTagRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FaceAnalysisResultSubmitRequestValidationTest {

	@Test
	void validResultRequestPassesBeanValidation() {
		FaceAnalysisResultSubmitRequest request = new FaceAnalysisResultSubmitRequest(
				"face-type-v1",
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

		try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
			Validator validator = factory.getValidator();

			assertThat(validator.validate(request)).isEmpty();
		}
	}

	@Test
	void blankModelAndInvalidTagValuesFailBeanValidation() {
		FaceAnalysisResultSubmitRequest request = new FaceAnalysisResultSubmitRequest(
				" ",
				List.of(
						new FaceAnalysisResultTagRequest(
								null,
								new BigDecimal("1.000001"),
								(short) 0
						)
				)
		);

		try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
			Validator validator = factory.getValidator();

			assertThat(validator.validate(request)).hasSizeGreaterThanOrEqualTo(4);
		}
	}
}
