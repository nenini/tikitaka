package com.date.backend.domain.result.domain;

public enum EvaluationItem {
	COMFORT("comfortScore", "대화가 편안했어요"),
	QUESTION_CONNECTION("questionConnectionScore", "질문이 자연스럽게 이어졌어요"),
	LISTENING("listeningScore", "내 이야기를 잘 들어줬어요"),
	REACTION("reactionScore", "반응과 리액션이 좋았어요"),
	BALANCE("balanceScore", "대화 참여가 균형적이었어요"),
	MANNER("mannerScore", "매너와 배려가 좋았어요");

	private final String key;
	private final String label;

	EvaluationItem(String key, String label) {
		this.key = key;
		this.label = label;
	}

	public String key() {
		return key;
	}

	public String label() {
		return label;
	}
}
