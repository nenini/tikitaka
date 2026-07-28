package com.date.backend.domain.aichat.repository;

import com.date.backend.domain.aichat.domain.ChatbotPersona;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatbotPersonaRepository extends JpaRepository<ChatbotPersona, Long> {
}
