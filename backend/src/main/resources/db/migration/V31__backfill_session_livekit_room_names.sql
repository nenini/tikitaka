UPDATE `sessions`
SET `livekitRoomName` = CASE
	WHEN `matchPairId` IS NOT NULL
		THEN CONCAT('date-room-', `matchPairId`)
	ELSE CONCAT('date-room-session-', `sessionId`)
END
WHERE `livekitRoomName` IS NULL
   OR TRIM(`livekitRoomName`) = '';
