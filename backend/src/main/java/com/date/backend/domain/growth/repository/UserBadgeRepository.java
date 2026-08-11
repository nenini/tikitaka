package com.date.backend.domain.growth.repository;
import com.date.backend.domain.growth.domain.UserBadge;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import java.util.List;
public interface UserBadgeRepository extends JpaRepository<UserBadge, Long> {
    boolean existsByUserIdAndBadgeId(Long userId, Long badgeId);
    List<UserBadge> findAllByUserId(Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select badge from UserBadge badge where badge.userId = :userId and badge.badgeId = :badgeId")
    Optional<UserBadge> findByUserIdAndBadgeIdForUpdate(
            @Param("userId") Long userId,
            @Param("badgeId") Long badgeId
    );
}
