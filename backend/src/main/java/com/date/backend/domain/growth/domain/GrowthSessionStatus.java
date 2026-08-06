package com.date.backend.domain.growth.domain;

public enum GrowthSessionStatus {
	COMPLETED("COMPLETED"),
	TERMINATED("CANCELLED");

	private final String sessionStatus;
	GrowthSessionStatus(String sessionStatus) { this.sessionStatus = sessionStatus; }
	public String sessionStatus() { return sessionStatus; }
}
