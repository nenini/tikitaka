package com.date.backend.domain.auth.repository;

import com.date.backend.domain.auth.domain.OAuthAccount;
import com.date.backend.domain.auth.domain.OAuthProvider;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OAuthAccountRepository extends JpaRepository<OAuthAccount, Long> {
	Optional<OAuthAccount> findByProviderAndProviderUserId(OAuthProvider provider, String providerUserId);
}
