package com.date.backend.domain.consent.repository;

import com.date.backend.domain.consent.domain.UserConsent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface UserConsentRepository extends JpaRepository<UserConsent, Long> {
	List<UserConsent> findAllByUser_IdAndConsentType_IdIn(Long userId, Collection<Long> consentTypeIds);
}
