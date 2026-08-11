package com.date.backend.domain.growth.application;

import com.date.backend.domain.growth.domain.GrowthSessionStatus;
import com.date.backend.domain.growth.dto.response.*;
import com.date.backend.domain.growth.repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class GrowthSessionQueryService {
	private static final int MAX_PAGE_SIZE = 50;
	private final GrowthSessionHistoryRepository repository;

	public GrowthSessionQueryService(GrowthSessionHistoryRepository repository) {
		this.repository = repository;
	}

	public GrowthSessionHistoryResponse getHistory(Long userId, LocalDate from, LocalDate to,
			GrowthSessionStatus status, Long cursor, int size) {
		validate(from, to, cursor, size);
		LocalDateTime fromAt = from == null ? null : from.atStartOfDay();
		LocalDateTime toAt = to == null ? null : to.plusDays(1).atStartOfDay();
		List<GrowthSessionHistoryProjection> fetched = repository.findHistory(
				userId, cursor, fromAt, toAt, status == null ? null : status.sessionStatus(),
				PageRequest.of(0, size + 1));
		boolean hasNext = fetched.size() > size;
		List<GrowthSessionHistoryProjection> page = hasNext ? fetched.subList(0, size) : fetched;
		List<GrowthSessionHistoryItemResponse> sessions = page.stream().map(this::toResponse).toList();
		Long nextCursor = hasNext && !page.isEmpty() ? page.getLast().getSessionId() : null;
		return new GrowthSessionHistoryResponse(sessions, nextCursor, hasNext);
	}

	private GrowthSessionHistoryItemResponse toResponse(GrowthSessionHistoryProjection row) {
		GrowthSessionStatus status = "COMPLETED".equals(row.getSessionStatus())
				? GrowthSessionStatus.COMPLETED : GrowthSessionStatus.TERMINATED;
		long durationSeconds = Duration.between(row.getActualStartAt(), row.getActualEndAt()).getSeconds();
		boolean reportExists = row.getReportId() != null;
		return new GrowthSessionHistoryItemResponse(row.getSessionId(), status,
				row.getScheduledStartAt(), row.getActualStartAt(), row.getActualEndAt(),
				Math.max(0, durationSeconds), "익명 상대",
				new GrowthSessionReportResponse(reportExists, row.getReportId(), row.getReportStatus()));
	}

	private void validate(LocalDate from, LocalDate to, Long cursor, int size) {
		if (from != null && to != null && from.isAfter(to)) {
			throw new IllegalArgumentException("조회 시작일은 종료일보다 늦을 수 없습니다.");
		}
		if (cursor != null && cursor <= 0) throw new IllegalArgumentException("커서는 0보다 커야 합니다.");
		if (size < 1 || size > MAX_PAGE_SIZE) {
			throw new IllegalArgumentException("조회 크기는 1 이상 50 이하여야 합니다.");
		}
	}
}
