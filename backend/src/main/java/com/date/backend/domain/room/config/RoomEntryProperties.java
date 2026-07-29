package com.date.backend.domain.room.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "room")
public record RoomEntryProperties(
		Duration entryOpenBefore,
		Duration entryCloseAfter
) {
	public RoomEntryProperties {
		entryOpenBefore = entryOpenBefore == null ? Duration.ofMinutes(10) : entryOpenBefore;
		entryCloseAfter = entryCloseAfter == null ? Duration.ofMinutes(10) : entryCloseAfter;
	}
}
