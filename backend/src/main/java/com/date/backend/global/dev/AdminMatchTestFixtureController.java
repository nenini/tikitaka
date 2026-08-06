package com.date.backend.global.dev;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Admin Test Fixture", description = "관리자용 테스트 데이터 준비 API")
@RestController
@RequestMapping("/api/v1/admin/test-fixtures")
@ConditionalOnProperty(
		prefix = "app.local-seed",
		name = "match-test-users-enabled",
		havingValue = "true"
)
public class AdminMatchTestFixtureController {
	private final LocalMatchTestDataInitializer fixtureService;

	public AdminMatchTestFixtureController(LocalMatchTestDataInitializer fixtureService) {
		this.fixtureService = fixtureService;
	}

	@Operation(
			summary = "테스트 매칭 세션 생성",
			description = "고정된 남녀 테스트 계정을 확정 매칭하고 지정한 분 뒤 시작하는 세션을 생성합니다."
	)
	@PostMapping("/matched-session")
	public LocalMatchTestDataInitializer.MatchedSessionFixture createMatchedSession(
			@Valid @RequestBody CreateMatchedSessionRequest request
	) {
		return fixtureService.createConfirmedSession(request.startAfterMinutes());
	}

	@ResponseStatus(HttpStatus.CONFLICT)
	@ExceptionHandler(TestFixtureConflictException.class)
	public ErrorResponse handleConflict(TestFixtureConflictException exception) {
		return new ErrorResponse("TEST_FIXTURE_ACTIVE_MATCH_EXISTS", exception.getMessage());
	}

	public record CreateMatchedSessionRequest(
			@Min(1) @Max(10_080) int startAfterMinutes
	) {
	}

	public record ErrorResponse(String code, String message) {
	}
}
