package com.date.backend.domain.growth.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity @Table(name = "user_badges", uniqueConstraints =
        @UniqueConstraint(name = "uk_user_badges_user_badge", columnNames = {"userId", "badgeId"}))
public class UserBadge {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "userBadgeId") private Long id;
    @Column(name = "userId", nullable = false) private Long userId;
    @Column(name = "badgeId", nullable = false) private Long badgeId;
    @Column(name = "awardedAt", nullable = false) private LocalDateTime awardedAt;
    @Column(name = "isDisplayed", nullable = false) private boolean displayed;
    @Column(name = "awardPolicyVersion", nullable = false, length = 50) private String awardPolicyVersion;
    protected UserBadge() {}
    public UserBadge(Long userId, Long badgeId, LocalDateTime awardedAt, String policyVersion) {
        this.userId=userId; this.badgeId=badgeId; this.awardedAt=awardedAt;
        this.awardPolicyVersion=policyVersion; this.displayed=false;
    }
    public Long getId(){return id;} public Long getBadgeId(){return badgeId;}
    public LocalDateTime getAwardedAt(){return awardedAt;} public String getAwardPolicyVersion(){return awardPolicyVersion;}
}
