CREATE TABLE user_temperatures (
    userId BIGINT NOT NULL PRIMARY KEY,
    temperature DECIMAL(5, 2) NOT NULL DEFAULT 36.50,
    policyVersion VARCHAR(50) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_user_temperatures_user FOREIGN KEY (userId) REFERENCES users (userId),
    CONSTRAINT ck_user_temperatures_range CHECK (temperature BETWEEN 20.00 AND 50.00)
);

INSERT INTO user_temperatures (userId, temperature, policyVersion)
SELECT userId, 36.50, 'temperature-v1.0.0' FROM users;

CREATE TABLE temperature_change_histories (
    temperatureChangeHistoryId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId BIGINT NOT NULL,
    sessionId BIGINT NULL,
    sourceType VARCHAR(30) NOT NULL,
    sourceId BIGINT NOT NULL,
    reason VARCHAR(50) NOT NULL,
    delta DECIMAL(5, 2) NOT NULL,
    beforeTemperature DECIMAL(5, 2) NOT NULL,
    afterTemperature DECIMAL(5, 2) NOT NULL,
    policyVersion VARCHAR(50) NOT NULL,
    changedAt DATETIME(6) NOT NULL,
    CONSTRAINT fk_temperature_history_user FOREIGN KEY (userId) REFERENCES users (userId),
    CONSTRAINT fk_temperature_history_session FOREIGN KEY (sessionId) REFERENCES sessions (sessionId),
    CONSTRAINT uk_temperature_history_source UNIQUE (sourceType, sourceId, policyVersion),
    INDEX idx_temperature_history_user_changed (userId, changedAt)
);
