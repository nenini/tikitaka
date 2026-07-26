package com.date.backend.domain.match.application;

import com.date.backend.domain.face.domain.UserFaceTag;
import com.date.backend.domain.face.repository.UserFaceTagRepository;
import com.date.backend.domain.match.domain.ActiveMatchRequest;
import com.date.backend.domain.match.domain.MatchRequest;
import com.date.backend.domain.match.domain.MatchRequestSlot;
import com.date.backend.domain.match.domain.MatchRequestStatus;
import com.date.backend.domain.match.domain.MatchRequestTraitSnapshot;
import com.date.backend.domain.match.domain.TraitSnapshotType;
import com.date.backend.domain.match.dto.request.MatchRequestCancelRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSaveRequest;
import com.date.backend.domain.match.dto.request.MatchRequestSlotInput;
import com.date.backend.domain.match.dto.response.MatchRequestResponse;
import com.date.backend.domain.match.repository.ActiveMatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestRepository;
import com.date.backend.domain.match.repository.MatchRequestSlotRepository;
import com.date.backend.domain.match.repository.MatchRequestTraitSnapshotRepository;
import com.date.backend.domain.profile.repository.ProfileRepository;
import com.date.backend.domain.survey.domain.PreferredFaceTag;
import com.date.backend.domain.survey.domain.PreferredTrait;
import com.date.backend.domain.survey.domain.TraitCatalog;
import com.date.backend.domain.survey.domain.UserTrait;
import com.date.backend.domain.survey.repository.PreferredFaceTagRepository;
import com.date.backend.domain.survey.repository.PreferredTraitRepository;
import com.date.backend.domain.survey.repository.UserTraitRepository;
import com.date.backend.domain.user.domain.User;
import com.date.backend.domain.user.repository.UserRepository;
import com.date.backend.global.exception.BusinessException;
import com.date.backend.global.exception.code.AuthErrorCode;
import com.date.backend.global.exception.code.MatchErrorCode;
import com.date.backend.global.exception.code.UserErrorCode;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class MatchRequestService {
	private static final ZoneId SERVICE_ZONE_ID = ZoneId.of("Asia/Seoul");
	private static final int REQUIRED_TRAIT_COUNT = 3;

	private final UserRepository userRepository;
	private final ProfileRepository profileRepository;
	private final PreferredFaceTagRepository preferredFaceTagRepository;
	private final PreferredTraitRepository preferredTraitRepository;
	private final UserTraitRepository userTraitRepository;
	private final UserFaceTagRepository userFaceTagRepository;
	private final MatchRequestRepository matchRequestRepository;
	private final ActiveMatchRequestRepository activeMatchRequestRepository;
	private final MatchRequestSlotRepository matchRequestSlotRepository;
	private final MatchRequestTraitSnapshotRepository traitSnapshotRepository;

	public MatchRequestService(
			UserRepository userRepository,
			ProfileRepository profileRepository,
			PreferredFaceTagRepository preferredFaceTagRepository,
			PreferredTraitRepository preferredTraitRepository,
			UserTraitRepository userTraitRepository,
			UserFaceTagRepository userFaceTagRepository,
			MatchRequestRepository matchRequestRepository,
			ActiveMatchRequestRepository activeMatchRequestRepository,
			MatchRequestSlotRepository matchRequestSlotRepository,
			MatchRequestTraitSnapshotRepository traitSnapshotRepository
	) {
		this.userRepository = userRepository;
		this.profileRepository = profileRepository;
		this.preferredFaceTagRepository = preferredFaceTagRepository;
		this.preferredTraitRepository = preferredTraitRepository;
		this.userTraitRepository = userTraitRepository;
		this.userFaceTagRepository = userFaceTagRepository;
		this.matchRequestRepository = matchRequestRepository;
		this.activeMatchRequestRepository = activeMatchRequestRepository;
		this.matchRequestSlotRepository = matchRequestSlotRepository;
		this.traitSnapshotRepository = traitSnapshotRepository;
	}

	@Transactional
	public MatchRequestResponse create(Long userId, MatchRequestSaveRequest request) {
		validateActiveUser(userId);
		validateRequest(request);
		if (activeMatchRequestRepository.existsById(userId)) {
			throw new BusinessException(MatchErrorCode.MATCH_REQUEST_ALREADY_ACTIVE);
		}

		MatchSourceSnapshot source = resolveSourceSnapshot(userId);
		MatchRequest matchRequest = matchRequestRepository.save(new MatchRequest(
				userId,
				request.preferredAgeMin(),
				request.preferredAgeMax(),
				source.preferredFaceTag().getFaceTag(),
				source.actualFaceTag().getFaceTag()
		));
		List<MatchRequestSlot> slots = saveSlots(matchRequest, request.availableSlots());
		List<MatchRequestTraitSnapshot> traits = saveTraits(matchRequest, source);

		try {
			activeMatchRequestRepository.saveAndFlush(
					new ActiveMatchRequest(userId, matchRequest)
			);
		} catch (DataIntegrityViolationException exception) {
			throw new BusinessException(MatchErrorCode.MATCH_REQUEST_ALREADY_ACTIVE);
		}
		return MatchRequestResponse.of(matchRequest, slots, traits);
	}

	public MatchRequestResponse getCurrent(Long userId) {
		validateActiveUser(userId);
		MatchRequest matchRequest = getActiveRequest(userId);
		return toResponse(matchRequest);
	}

	@Transactional
	public MatchRequestResponse update(Long userId, MatchRequestSaveRequest request) {
		validateActiveUser(userId);
		validateRequest(request);
		MatchRequest matchRequest = getActiveRequestForUpdate(userId);
		validateWaiting(matchRequest);

		MatchSourceSnapshot source = resolveSourceSnapshot(userId);
		matchRequest.updateSnapshot(
				request.preferredAgeMin(),
				request.preferredAgeMax(),
				source.preferredFaceTag().getFaceTag(),
				source.actualFaceTag().getFaceTag()
		);

		matchRequestSlotRepository.deleteAllByMatchRequest_Id(matchRequest.getId());
		traitSnapshotRepository.deleteAllByMatchRequest_Id(matchRequest.getId());
		matchRequestSlotRepository.flush();
		traitSnapshotRepository.flush();

		List<MatchRequestSlot> slots = saveSlots(matchRequest, request.availableSlots());
		List<MatchRequestTraitSnapshot> traits = saveTraits(matchRequest, source);
		return MatchRequestResponse.of(matchRequest, slots, traits);
	}

	@Transactional
	public void cancel(Long userId, MatchRequestCancelRequest request) {
		validateActiveUser(userId);
		MatchRequest matchRequest = getActiveRequestForUpdate(userId);
		validateWaiting(matchRequest);

		matchRequest.cancel(
				LocalDateTime.now(SERVICE_ZONE_ID),
				request == null ? null : request.reason()
		);
		activeMatchRequestRepository.deleteById(userId);
	}

	private MatchRequestResponse toResponse(MatchRequest matchRequest) {
		List<MatchRequestSlot> slots = matchRequestSlotRepository
				.findAllByMatchRequest_IdOrderByDayOfWeekAscStartTimeAsc(matchRequest.getId());
		List<MatchRequestTraitSnapshot> traits = traitSnapshotRepository
				.findAllByMatchRequest_IdIn(List.of(matchRequest.getId()));
		traits.sort(Comparator
				.comparing(MatchRequestTraitSnapshot::getSnapshotType)
				.thenComparing(snapshot -> snapshot.getTrait().getDisplayOrder()));
		return MatchRequestResponse.of(matchRequest, slots, traits);
	}

	private MatchSourceSnapshot resolveSourceSnapshot(Long userId) {
		if (!profileRepository.existsById(userId)) {
			throw new BusinessException(MatchErrorCode.MATCH_PROFILE_REQUIRED);
		}

		PreferredFaceTag preferredFaceTag = preferredFaceTagRepository.findByUserId(userId)
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_SURVEY_REQUIRED
				));
		List<PreferredTrait> preferredTraits = preferredTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(userId);
		List<UserTrait> selfTraits = userTraitRepository
				.findAllByUserIdOrderByTrait_DisplayOrderAsc(userId);
		if (preferredTraits.size() != REQUIRED_TRAIT_COUNT
				|| selfTraits.size() != REQUIRED_TRAIT_COUNT) {
			throw new BusinessException(MatchErrorCode.MATCH_SURVEY_REQUIRED);
		}

		UserFaceTag actualFaceTag = userFaceTagRepository
				.findFirstByUserIdOrderByRankOrderAsc(userId)
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_FACE_ANALYSIS_REQUIRED
				));
		return new MatchSourceSnapshot(
				preferredFaceTag,
				actualFaceTag,
				preferredTraits.stream().map(PreferredTrait::getTrait).toList(),
				selfTraits.stream().map(UserTrait::getTrait).toList()
		);
	}

	private List<MatchRequestSlot> saveSlots(
			MatchRequest matchRequest,
			List<MatchRequestSlotInput> inputs
	) {
		List<MatchRequestSlot> slots = inputs.stream()
				.map(input -> new MatchRequestSlot(
						matchRequest,
						input.dayOfWeek(),
						input.startTime(),
						input.endTime()
				))
				.toList();
		return matchRequestSlotRepository.saveAll(slots);
	}

	private List<MatchRequestTraitSnapshot> saveTraits(
			MatchRequest matchRequest,
			MatchSourceSnapshot source
	) {
		List<MatchRequestTraitSnapshot> snapshots = new ArrayList<>();
		source.preferredTraits().forEach(trait -> snapshots.add(
				new MatchRequestTraitSnapshot(
						matchRequest,
						trait,
						TraitSnapshotType.PREFERRED
				)
		));
		source.selfTraits().forEach(trait -> snapshots.add(
				new MatchRequestTraitSnapshot(
						matchRequest,
						trait,
						TraitSnapshotType.SELF
				)
		));
		return traitSnapshotRepository.saveAll(snapshots);
	}

	private MatchRequest getActiveRequest(Long userId) {
		return activeMatchRequestRepository.findByUserId(userId)
				.map(ActiveMatchRequest::getMatchRequest)
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_REQUEST_NOT_FOUND
				));
	}

	private MatchRequest getActiveRequestForUpdate(Long userId) {
		MatchRequest activeRequest = activeMatchRequestRepository.findForUpdateByUserId(userId)
				.map(ActiveMatchRequest::getMatchRequest)
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_REQUEST_NOT_FOUND
				));
		return matchRequestRepository.findAllByIdForUpdate(List.of(activeRequest.getId()))
				.stream()
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						MatchErrorCode.MATCH_REQUEST_NOT_FOUND
				));
	}

	private void validateWaiting(MatchRequest matchRequest) {
		if (matchRequest.getStatus() != MatchRequestStatus.WAITING) {
			throw new BusinessException(MatchErrorCode.MATCH_REQUEST_NOT_WAITING);
		}
	}

	private void validateActiveUser(Long userId) {
		User user = userRepository.findById(userId)
				.orElseThrow(() -> new BusinessException(AuthErrorCode.UNAUTHORIZED));
		if (!user.isActive()) {
			throw new BusinessException(UserErrorCode.INACTIVE_ACCOUNT);
		}
	}

	private void validateRequest(MatchRequestSaveRequest request) {
		if (request == null
				|| request.preferredAgeMin() == null
				|| request.preferredAgeMax() == null
				|| request.preferredAgeMin() <= 0
				|| request.preferredAgeMax() < request.preferredAgeMin()
				|| request.availableSlots() == null
				|| request.availableSlots().isEmpty()
				|| request.availableSlots().size() > 14
				|| request.availableSlots().stream().anyMatch(this::isInvalidSlot)
				|| request.availableSlots().stream().distinct().count()
						!= request.availableSlots().size()
				|| hasOverlappingSlots(request.availableSlots())) {
			throw new BusinessException(MatchErrorCode.INVALID_MATCH_REQUEST);
		}
	}

	private boolean isInvalidSlot(MatchRequestSlotInput slot) {
		return slot == null
				|| slot.dayOfWeek() == null
				|| slot.startTime() == null
				|| slot.endTime() == null
				|| !slot.startTime().isBefore(slot.endTime());
	}

	private boolean hasOverlappingSlots(List<MatchRequestSlotInput> slots) {
		for (int left = 0; left < slots.size(); left++) {
			for (int right = left + 1; right < slots.size(); right++) {
				MatchRequestSlotInput first = slots.get(left);
				MatchRequestSlotInput second = slots.get(right);
				if (first.dayOfWeek() == second.dayOfWeek()
						&& first.startTime().isBefore(second.endTime())
						&& second.startTime().isBefore(first.endTime())) {
					return true;
				}
			}
		}
		return false;
	}

	private record MatchSourceSnapshot(
			PreferredFaceTag preferredFaceTag,
			UserFaceTag actualFaceTag,
			List<TraitCatalog> preferredTraits,
			List<TraitCatalog> selfTraits
	) {
	}
}
