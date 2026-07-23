package com.date.backend.domain.survey.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "practice_goal_catalog")
public class PracticeGoalCatalog {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "practiceGoalId")
	private Long id;

	@Column(name = "code", nullable = false, unique = true, length = 50)
	private String code;

	@Column(name = "name", nullable = false, length = 100)
	private String name;

	@Column(name = "description", length = 500)
	private String description;

	@Column(name = "isActive", nullable = false)
	private boolean active;

	@Enumerated(EnumType.STRING)
	@Column(name = "goalCategory", nullable = false, length = 30)
	private GoalCategory category;

	@Column(name = "displayOrder", nullable = false)
	private Short displayOrder;

	protected PracticeGoalCatalog() {
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public boolean isActive() {
		return active;
	}

	public GoalCategory getCategory() {
		return category;
	}

	public Short getDisplayOrder() {
		return displayOrder;
	}
}
