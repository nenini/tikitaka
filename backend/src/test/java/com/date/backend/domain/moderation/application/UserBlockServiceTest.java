package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.domain.UserBlock;
import com.date.backend.domain.moderation.dto.request.UserBlockCreateRequest;
import com.date.backend.domain.moderation.repository.UserBlockRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserBlockServiceTest {
	private UserBlockRepository blockRepository;
	private UserRepository userRepository;
	private UserBlockService service;

	@BeforeEach
	void setUp() {
		blockRepository = mock(UserBlockRepository.class);
		userRepository = mock(UserRepository.class);
		when(userRepository.findByIdForUpdate(1L))
				.thenReturn(Optional.of(mock(User.class)));
		when(userRepository.existsById(2L)).thenReturn(true);
		when(blockRepository.saveAndFlush(any(UserBlock.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
		service = new UserBlockService(blockRepository, userRepository);
	}

	@Test
	void createsBlockWhenRelationDoesNotExist() {
		when(blockRepository.findByBlockerUserIdAndBlockedUserId(1L, 2L))
				.thenReturn(Optional.empty());

		var response = service.block(
				1L,
				2L,
				new UserBlockCreateRequest("원치 않는 연락")
		);

		assertThat(response.blockedUserId()).isEqualTo(2L);
		assertThat(response.reason()).isEqualTo("원치 않는 연락");
		assertThat(response.alreadyBlocked()).isFalse();
		verify(blockRepository).saveAndFlush(any(UserBlock.class));
	}

	@Test
	void duplicateBlockReturnsExistingRelation() {
		UserBlock existing = new UserBlock(1L, 2L, "기존 차단");
		when(blockRepository.findByBlockerUserIdAndBlockedUserId(1L, 2L))
				.thenReturn(Optional.of(existing));

		var response = service.block(1L, 2L, null);

		assertThat(response.alreadyBlocked()).isTrue();
		assertThat(response.reason()).isEqualTo("기존 차단");
		verify(blockRepository, never()).saveAndFlush(any());
	}

	@Test
	void unblockDeletesExistingRelation() {
		UserBlock existing = new UserBlock(1L, 2L, null);
		when(blockRepository.findByBlockerUserIdAndBlockedUserId(1L, 2L))
				.thenReturn(Optional.of(existing));

		var response = service.unblock(1L, 2L);

		assertThat(response.unblocked()).isTrue();
		verify(blockRepository).delete(existing);
	}

	@Test
	void missingUnblockIsIdempotent() {
		when(blockRepository.findByBlockerUserIdAndBlockedUserId(1L, 2L))
				.thenReturn(Optional.empty());

		var response = service.unblock(1L, 2L);

		assertThat(response.unblocked()).isFalse();
		verify(blockRepository, never()).delete(any());
	}

	@Test
	void selfBlockIsRejected() {
		assertThatThrownBy(() -> service.block(1L, 1L, null))
				.isInstanceOfSatisfying(BusinessException.class, exception ->
						assertThat(exception.getErrorCode()).isEqualTo(
								ModerationErrorCode.SELF_BLOCK_NOT_ALLOWED
						)
				);
	}

	@Test
	void returnsMyBlocksInRepositoryOrder() {
		when(blockRepository.findAllByBlockerUserIdOrderByCreatedAtDesc(1L))
				.thenReturn(List.of(
						new UserBlock(1L, 3L, null),
						new UserBlock(1L, 2L, null)
				));

		var response = service.getMyBlocks(1L);

		assertThat(response.blocks())
				.extracting(block -> block.blockedUserId())
				.containsExactly(3L, 2L);
	}

	@Test
	void exposesBidirectionalBlockPolicy() {
		when(blockRepository.existsBlockRelation(1L, 2L)).thenReturn(true);

		assertThat(service.isBlockedBetween(1L, 2L)).isTrue();
	}
}
