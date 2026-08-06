package com.date.backend.domain.growth.repository;
import com.date.backend.domain.growth.domain.UserTemperature;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
public interface UserTemperatureRepository extends JpaRepository<UserTemperature, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select temperature from UserTemperature temperature where temperature.userId = :userId")
    Optional<UserTemperature> findByUserIdForUpdate(@Param("userId") Long userId);
}
