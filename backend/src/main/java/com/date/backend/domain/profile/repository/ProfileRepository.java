package com.date.backend.domain.profile.repository;

import com.date.backend.domain.profile.domain.Profile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileRepository extends JpaRepository<Profile, Long> {
	boolean existsByNickname(String nickname);

	boolean existsByNicknameAndUserIdNot(String nickname, Long userId);
}
