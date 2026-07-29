package com.date.backend.domain.silence.repository;

import com.date.backend.domain.silence.domain.QuestionCard;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionCardRepository extends JpaRepository<QuestionCard, Long> {
	List<QuestionCard> findAllByActiveTrueAndSensitiveFalseOrderByDisplayOrderAsc();
}
