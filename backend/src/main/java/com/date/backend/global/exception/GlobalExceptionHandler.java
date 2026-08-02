package com.date.backend.global.exception;

import com.date.backend.global.api.ApiErrorResponse;
import com.date.backend.global.exception.code.CommonErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {
	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(BusinessException.class)
	public ResponseEntity<ApiErrorResponse> handleBusinessException(
			BusinessException exception,
			HttpServletRequest request
	) {
		ErrorCode errorCode = exception.getErrorCode();
		return response(errorCode, exception.getMessage(), request);
	}

	@ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
	public ResponseEntity<ApiErrorResponse> handleBindingException(
			BindException exception,
			HttpServletRequest request
	) {
		List<ApiErrorResponse.FieldError> errors = exception.getBindingResult()
				.getFieldErrors()
				.stream()
				.map(this::toFieldError)
				.toList();

		ErrorCode errorCode = CommonErrorCode.INVALID_INPUT;
		ApiErrorResponse body = ApiErrorResponse.of(
				errorCode.code(),
				errorCode.message(),
				errors,
				request.getRequestURI()
		);
		return ResponseEntity.status(errorCode.status())
				.contentType(MediaType.APPLICATION_JSON)
				.body(body);
	}

	@ExceptionHandler({
			ConstraintViolationException.class,
			MethodArgumentTypeMismatchException.class,
			MissingServletRequestParameterException.class
	})
	public ResponseEntity<ApiErrorResponse> handleInvalidInput(
			Exception exception,
			HttpServletRequest request
	) {
		return response(CommonErrorCode.INVALID_INPUT, null, request);
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ApiErrorResponse> handleUnreadableMessage(
			HttpMessageNotReadableException exception,
			HttpServletRequest request
	) {
		return response(CommonErrorCode.INVALID_REQUEST_BODY, null, request);
	}

	@ExceptionHandler(NoResourceFoundException.class)
	public ResponseEntity<ApiErrorResponse> handleNotFound(
			NoResourceFoundException exception,
			HttpServletRequest request
	) {
		return response(CommonErrorCode.RESOURCE_NOT_FOUND, null, request);
	}

	@ExceptionHandler(HttpRequestMethodNotSupportedException.class)
	public ResponseEntity<ApiErrorResponse> handleMethodNotAllowed(
			HttpRequestMethodNotSupportedException exception,
			HttpServletRequest request
	) {
		return response(CommonErrorCode.METHOD_NOT_ALLOWED, null, request);
	}

	@ExceptionHandler(HttpMediaTypeNotSupportedException.class)
	public ResponseEntity<ApiErrorResponse> handleUnsupportedMediaType(
			HttpMediaTypeNotSupportedException exception,
			HttpServletRequest request
	) {
		return response(CommonErrorCode.UNSUPPORTED_MEDIA_TYPE, null, request);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ApiErrorResponse> handleUnexpectedException(
			Exception exception,
			HttpServletRequest request
	) {
		log.error("Unhandled exception: {} {}", request.getMethod(), request.getRequestURI(), exception);
		return response(CommonErrorCode.INTERNAL_SERVER_ERROR, null, request);
	}

	private ResponseEntity<ApiErrorResponse> response(
			ErrorCode errorCode,
			String message,
			HttpServletRequest request
	) {
		String responseMessage = message == null || message.isBlank() ? errorCode.message() : message;
		ApiErrorResponse body = ApiErrorResponse.of(
				errorCode.code(),
				responseMessage,
				request.getRequestURI()
		);
		return ResponseEntity.status(errorCode.status())
				.contentType(MediaType.APPLICATION_JSON)
				.body(body);
	}

	private ApiErrorResponse.FieldError toFieldError(FieldError error) {
		return new ApiErrorResponse.FieldError(
				error.getField(),
				error.getRejectedValue(),
				error.getDefaultMessage()
		);
	}
}
