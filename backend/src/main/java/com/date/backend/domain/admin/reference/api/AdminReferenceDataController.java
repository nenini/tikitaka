package com.date.backend.domain.admin.reference.api;

import com.date.backend.domain.admin.reference.application.AdminReferenceDataService;
import com.date.backend.domain.admin.reference.dto.response.ReferenceDataSummaryResponse;
import com.date.backend.global.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/reference-data")
public class AdminReferenceDataController implements AdminReferenceDataSwaggerDocs {

	private final AdminReferenceDataService service;

	public AdminReferenceDataController(AdminReferenceDataService service) {
		this.service = service;
	}

	@Override
	@GetMapping("/summary")
	public ApiResponse<ReferenceDataSummaryResponse> getSummary() {
		return ApiResponse.success(service.getSummary());
	}
}
