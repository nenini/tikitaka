package com.date.backend.domain.auth.password;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class SmtpPasswordResetMailSender implements PasswordResetMailSender {
	private final JavaMailSender mailSender;
	private final PasswordResetProperties properties;

	public SmtpPasswordResetMailSender(JavaMailSender mailSender, PasswordResetProperties properties) {
		this.mailSender = mailSender;
		this.properties = properties;
	}

	@Override
	public void send(String email, String token) {
		SimpleMailMessage message = new SimpleMailMessage();
		message.setFrom(properties.from());
		message.setTo(email);
		message.setSubject("[DATE] 비밀번호 재설정 안내");
		message.setText("아래 링크에서 비밀번호를 재설정해 주세요.\n\n"
				+ properties.url() + "?token=" + token
				+ "\n\n이 링크는 " + properties.tokenValiditySeconds() / 60 + "분 동안 한 번만 사용할 수 있습니다.");
		mailSender.send(message);
	}
}
