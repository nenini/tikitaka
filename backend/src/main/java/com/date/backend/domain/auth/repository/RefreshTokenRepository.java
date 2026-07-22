package com.date.backend.domain.auth.repository;

import com.date.backend.domain.auth.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
	Optional<RefreshToken> findByTokenHash(String tokenHash);

	List<RefreshToken> findAllByUserIdAndRevokedAtIsNull(Long userId);
}
