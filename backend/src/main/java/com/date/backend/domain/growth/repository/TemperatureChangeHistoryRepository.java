package com.date.backend.domain.growth.repository;
import com.date.backend.domain.growth.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface TemperatureChangeHistoryRepository extends JpaRepository<TemperatureChangeHistory, Long> {
    boolean existsBySourceTypeAndSourceIdAndPolicyVersion(TemperatureSourceType type, Long sourceId, String version);
    Optional<TemperatureChangeHistory> findBySourceTypeAndSourceIdAndPolicyVersion(TemperatureSourceType type, Long sourceId, String version);
    List<TemperatureChangeHistory> findTop10ByUserIdOrderByChangedAtDescIdDesc(Long userId);
}
