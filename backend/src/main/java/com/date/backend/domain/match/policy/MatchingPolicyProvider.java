package com.date.backend.domain.match.policy;

import com.date.backend.domain.match.domain.MatchingPolicy;
import com.date.backend.domain.match.repository.MatchingPolicyRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MatchingPolicyProvider {

	private final MatchingPolicyRepository repository;

	public MatchingPolicyProvider(MatchingPolicyRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public MatchingPolicySnapshot current() {
		MatchingPolicy policy = repository.findById(MatchingPolicy.SINGLETON_ID)
				.orElseThrow(() -> new IllegalStateException("기본 매칭 정책을 찾을 수 없습니다."));
		return MatchingPolicySnapshot.from(policy);
	}
}
