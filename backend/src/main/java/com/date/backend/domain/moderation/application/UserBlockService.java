package com.date.backend.domain.moderation.application;

import com.date.backend.domain.moderation.domain.UserBlock;
import com.date.backend.domain.moderation.dto.request.UserBlockCreateRequest;
import com.date.backend.domain.moderation.dto.response.UserBlockDeleteResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockListResponse;
import com.date.backend.domain.moderation.dto.response.UserBlockResponse;
import com.date.backend.domain.moderation.repository.UserBlockRepository;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.ModerationErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserBlockService implements UserBlockPolicy {
	private final UserBlockRepository blockRepository;
	private final UserRepository userRepository;

	public UserBlockService(
			UserBlockRepository blockRepository,
			UserRepository userRepository
	) {
		this.blockRepository = blockRepository;
		this.userRepository = userRepository;
	}

	@Transactional
	public UserBlockResponse block(
			Long blockerUserId,
			Long blockedUserId,
			UserBlockCreateRequest request
	) {
		validateDifferentUsers(blockerUserId, blockedUserId);
		lockBlocker(blockerUserId);
		assertTargetExists(blockedUserId);

		return blockRepository
				.findByBlockerUserIdAndBlockedUserId(
						blockerUserId,
						blockedUserId
				)
				.map(block -> toResponse(block, true))
				.orElseGet(() -> toResponse(
						blockRepository.saveAndFlush(new UserBlock(
								blockerUserId,
								blockedUserId,
								request == null ? null : request.reason()
						)),
						false
				));
	}

	@Transactional
	public UserBlockDeleteResponse unblock(
			Long blockerUserId,
			Long blockedUserId
	) {
		validateDifferentUsers(blockerUserId, blockedUserId);
		lockBlocker(blockerUserId);
		assertTargetExists(blockedUserId);

		return blockRepository
				.findByBlockerUserIdAndBlockedUserId(
						blockerUserId,
						blockedUserId
				)
				.map(block -> {
					blockRepository.delete(block);
					return new UserBlockDeleteResponse(blockedUserId, true);
				})
				.orElseGet(() -> new UserBlockDeleteResponse(
						blockedUserId,
						false
				));
	}

	@Transactional(readOnly = true)
	public UserBlockListResponse getMyBlocks(Long blockerUserId) {
		return new UserBlockListResponse(
				blockRepository
						.findAllByBlockerUserIdOrderByCreatedAtDesc(
								blockerUserId
						)
						.stream()
						.map(block -> toResponse(block, false))
						.toList()
		);
	}

	@Override
	@Transactional(readOnly = true)
	public boolean isBlockedBetween(Long firstUserId, Long secondUserId) {
		if (firstUserId == null || secondUserId == null) {
			return false;
		}
		if (firstUserId.equals(secondUserId)) {
			return false;
		}
		return blockRepository.existsBlockRelation(
				firstUserId,
				secondUserId
		);
	}

	private void lockBlocker(Long blockerUserId) {
		userRepository.findByIdForUpdate(blockerUserId)
				.orElseThrow(() -> new BusinessException(
						ModerationErrorCode.BLOCK_TARGET_NOT_FOUND
				));
	}

	private void assertTargetExists(Long blockedUserId) {
		if (!userRepository.existsById(blockedUserId)) {
			throw new BusinessException(
					ModerationErrorCode.BLOCK_TARGET_NOT_FOUND
			);
		}
	}

	private void validateDifferentUsers(
			Long blockerUserId,
			Long blockedUserId
	) {
		if (blockerUserId.equals(blockedUserId)) {
			throw new BusinessException(
					ModerationErrorCode.SELF_BLOCK_NOT_ALLOWED
			);
		}
	}

	private UserBlockResponse toResponse(
			UserBlock block,
			boolean alreadyBlocked
	) {
		return new UserBlockResponse(
				block.getId(),
				block.getBlockedUserId(),
				block.getReason(),
				block.getCreatedAt(),
				alreadyBlocked
		);
	}
}
