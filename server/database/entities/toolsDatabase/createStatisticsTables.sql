CREATE TABLE `huwiki_actor` (
  `actor_id` bigint(20) NOT NULL,
  `actor_name` varbinary(255) NOT NULL,
  `is_registered` tinyint(1) NOT NULL,
  `user_groups` varbinary(255) NOT NULL,
  PRIMARY KEY (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwiki_actor_stats` (
  `actor_id` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`date`),
  CONSTRAINT `huwiki_actor_stats_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwiki_actor_stats_by_ns` (
  `actor_id` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `namespace` int(11) NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`date`,`namespace`),
  CONSTRAINT `huwiki_actor_stats_by_ns_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
