package com.date.backend.domain.growth.repository;
import com.date.backend.domain.growth.domain.UserBadge;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface UserBadgeRepository extends JpaRepository<UserBadge, Long> {
    boolean existsByUserIdAndBadgeId(Long userId, Long badgeId);
    List<UserBadge> findAllByUserId(Long userId);
}
