package com.date.backend.domain.match.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
@EnableScheduling
@EnableConfigurationProperties({
		MatchSchedulerProperties.class,
		MatchPolicyProperties.class
})
public class MatchSchedulerConfiguration {

	@Bean
	Clock matchClock() {
		return Clock.system(ZoneId.of("Asia/Seoul"));
	}
}
