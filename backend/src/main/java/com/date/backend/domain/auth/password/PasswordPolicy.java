package com.date.backend.domain.auth.password;

public final class PasswordPolicy {
	public static final String REGEXP = "^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z\\d\\s]).{8,64}$";
	public static final String MESSAGE = "비밀번호는 8~64자이며 영문, 숫자, 특수문자를 각각 하나 이상 포함해야 합니다.";

	private PasswordPolicy() {
	}
}
