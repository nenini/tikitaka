package com.date.backend.global.exception.code;

import com.date.backend.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum GrowthErrorCode implements ErrorCode {
    BADGE_NOT_ACQUIRED(
            HttpStatus.NOT_FOUND,
            "BADGE_NOT_ACQUIRED",
            "획득한 뱃지를 찾을 수 없습니다."
    );

    private final HttpStatus status;
    private final String code;
    private final String message;

    GrowthErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }

    @Override public HttpStatus status() { return status; }
    @Override public String code() { return code; }
    @Override public String message() { return message; }
}
