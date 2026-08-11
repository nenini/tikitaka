package com.date.backend.domain.survey.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.util.Objects;

@Entity
@Table(name = "user_practice_goals")
public class UserPracticeGoal extends SurveyAnswerBaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "userPracticeGoalId")
	private Long id;

	@Column(name = "userId", nullable = false)
	private Long userId;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "practiceGoalId")
	private PracticeGoalCatalog practiceGoal;

	@Column(name = "customGoal", length = 255)
	private String customGoal;

	@Column(name = "isActive", nullable = false)
	private boolean active = true;

	protected UserPracticeGoal() {
	}

	public UserPracticeGoal(Long userId, PracticeGoalCatalog practiceGoal) {
		this.userId = userId;
		this.practiceGoal = Objects.requireNonNull(practiceGoal);
	}

	public void update(PracticeGoalCatalog practiceGoal) {
		this.practiceGoal = Objects.requireNonNull(practiceGoal);
		this.customGoal = null;
		this.active = true;
	}

	public void deactivate() {
		this.active = false;
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public PracticeGoalCatalog getPracticeGoal() {
		return practiceGoal;
	}

	public String getCustomGoal() {
		return customGoal;
	}

	public boolean isActive() {
		return active;
	}
}
