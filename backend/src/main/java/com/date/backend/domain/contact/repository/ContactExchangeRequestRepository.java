package com.date.backend.domain.contact.repository;

import com.date.backend.domain.contact.domain.ContactExchangeRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ContactExchangeRequestRepository
		extends JpaRepository<ContactExchangeRequest, Long> {

	Optional<ContactExchangeRequest> findBySession_Id(Long sessionId);
}
