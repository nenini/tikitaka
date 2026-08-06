package com.date.backend.domain.growth.repository;
import com.date.backend.domain.growth.domain.BadgeCatalog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BadgeCatalogRepository extends JpaRepository<BadgeCatalog, Long> {
    List<BadgeCatalog> findAllByOrderByDisplayOrderAscIdAsc();
}
