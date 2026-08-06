package com.date.backend.domain.growth.domain;

import jakarta.persistence.*;

@Entity @Table(name = "badge_catalog")
public class BadgeCatalog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "badgeId") private Long id;
    @Column(name = "code", nullable = false, unique = true, length = 50) private String code;
    @Column(name = "name", nullable = false, length = 100) private String name;
    @Column(name = "description", length = 500) private String description;
    @Enumerated(EnumType.STRING) @Column(name = "conditionType", length = 500) private BadgeConditionType conditionType;
    @Column(name = "thresholdCount") private Integer thresholdCount;
    @Column(name = "iconUrl", length = 100) private String iconUrl;
    @Column(name = "isActive", nullable = false) private boolean active;
    @Column(name = "displayOrder") private Integer displayOrder;
    @Column(name = "policyVersion", nullable = false, length = 50) private String policyVersion;
    protected BadgeCatalog() {}
    public Long getId(){return id;} public String getCode(){return code;} public String getName(){return name;}
    public String getDescription(){return description;} public BadgeConditionType getConditionType(){return conditionType;}
    public Integer getThresholdCount(){return thresholdCount;} public String getIconUrl(){return iconUrl;}
    public boolean isActive(){return active;} public Integer getDisplayOrder(){return displayOrder;}
    public String getPolicyVersion(){return policyVersion;}
}
