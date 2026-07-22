package com.date.backend.domain.auth.password;

public interface PasswordResetMailSender {
	void send(String email, String token);
}
