package com.date.backend.domain.room.application;

import com.date.backend.domain.match.domain.MatchPair;
import com.date.backend.domain.room.domain.RoomParticipant;
import com.date.backend.domain.room.domain.WaitingRoom;
import com.date.backend.domain.room.repository.RoomParticipantRepository;
import com.date.backend.domain.room.repository.WaitingRoomRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
public class WaitingRoomProvisioningService {
	private final WaitingRoomRepository roomRepository;
	private final RoomParticipantRepository participantRepository;
	private final ApplicationEventPublisher eventPublisher;

	public WaitingRoomProvisioningService(
			WaitingRoomRepository roomRepository,
			RoomParticipantRepository participantRepository,
			ApplicationEventPublisher eventPublisher
	) {
		this.roomRepository = roomRepository;
		this.participantRepository = participantRepository;
		this.eventPublisher = eventPublisher;
	}

	public void provision(MatchPair pair) {
		if (roomRepository.existsByMatchPair_Id(pair.getId())) {
			return;
		}
		WaitingRoom room = roomRepository.saveAndFlush(new WaitingRoom(pair));
		participantRepository.save(new RoomParticipant(room, pair.getUserAId(), "A"));
		participantRepository.save(new RoomParticipant(room, pair.getUserBId(), "B"));
		eventPublisher.publishEvent(
				new WaitingRoomCreatedEvent(room.getId(), room.getLivekitRoomName())
		);
	}
}
