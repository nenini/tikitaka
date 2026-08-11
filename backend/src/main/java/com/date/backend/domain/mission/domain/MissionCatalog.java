package com.date.backend.domain.mission.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "mission_catalog")
public class MissionCatalog {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "mission_id")
	private Long id;

	@Column(name = "code", nullable = false, unique = true, length = 60)
	private String code;

	@Column(name = "practice_goal_code", nullable = false, length = 50)
	private String practiceGoalCode;

	@Column(name = "title", nullable = false, length = 100)
	private String title;

	@Column(name = "description", nullable = false, length = 500)
	private String description;

	@Column(name = "target_value", nullable = false)
	private int targetValue;

	@Enumerated(EnumType.STRING)
	@Column(name = "progress_unit", nullable = false, length = 20)
	private MissionProgressUnit progressUnit;

	@Column(name = "display_order", nullable = false)
	private short displayOrder;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	protected MissionCatalog() {
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getPracticeGoalCode() {
		return practiceGoalCode;
	}

	public String getTitle() {
		return title;
	}

	public String getDescription() {
		return description;
	}

	public int getTargetValue() {
		return targetValue;
	}

	public MissionProgressUnit getProgressUnit() {
		return progressUnit;
	}

	public short getDisplayOrder() {
		return displayOrder;
	}

	public boolean isActive() {
		return active;
	}
}
