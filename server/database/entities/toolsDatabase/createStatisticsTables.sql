CREATE TABLE `wiki_processed_revisions` (
  `wiki` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_processed_revision_id` int(8) NOT NULL,
  PRIMARY KEY (`wiki`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- huwiki

CREATE TABLE `huwiki_actor` (
  `actor_id` bigint(20) NOT NULL,
  `actor_name` varbinary(255) NOT NULL,
  `is_registered` tinyint(1) NOT NULL,
  `registration_timestamp` datetime DEFAULT NULL,
  `is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwiki_actor_groups` (
  `actor_id` bigint(20) NOT NULL,
  `group_name` varbinary(255) NOT NULL,
  PRIMARY KEY (`actor_id`,`group_name`),
  CONSTRAINT `huwiki_actor_groups_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
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
  `namespace` int(11) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`namespace`,`date`),
  CONSTRAINT `huwiki_actor_stats_by_ns_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- huwikisource

CREATE TABLE `huwikisource_actor` (
  `actor_id` bigint(20) NOT NULL,
  `actor_name` varbinary(255) NOT NULL,
  `is_registered` tinyint(1) NOT NULL,
  `registration_timestamp` datetime DEFAULT NULL,
  `is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwikisource_actor_groups` (
  `actor_id` bigint(20) NOT NULL,
  `group_name` varbinary(255) NOT NULL,
  PRIMARY KEY (`actor_id`,`group_name`),
  CONSTRAINT `huwikisource_actor_groups_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwikisource_actor_stats` (
  `actor_id` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`date`),
  CONSTRAINT `huwikisource_actor_stats_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwikisource_actor_stats_by_ns` (
  `actor_id` bigint(20) NOT NULL,
  `namespace` int(11) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`namespace`,`date`),
  CONSTRAINT `huwikisource_actor_stats_by_ns_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- huwikiquote

CREATE TABLE `huwikiquote_actor` (
  `actor_id` bigint(20) NOT NULL,
  `actor_name` varbinary(255) NOT NULL,
  `is_registered` tinyint(1) NOT NULL,
  `registration_timestamp` datetime DEFAULT NULL,
  `is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_groups` (
  `actor_id` bigint(20) NOT NULL,
  `group_name` varbinary(255) NOT NULL,
  PRIMARY KEY (`actor_id`,`group_name`),
  CONSTRAINT `huwikiquote_actor_groups_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_stats` (
  `actor_id` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`date`),
  CONSTRAINT `huwikiquote_actor_stats_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_stats_by_ns` (
  `actor_id` bigint(20) NOT NULL,
  `namespace` int(11) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`namespace`,`date`),
  CONSTRAINT `huwikiquote_actor_stats_by_ns_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- huwiktionary

CREATE TABLE `huwiktionary_actor` (
  `actor_id` bigint(20) NOT NULL,
  `actor_name` varbinary(255) NOT NULL,
  `is_registered` tinyint(1) NOT NULL,
  `registration_timestamp` datetime DEFAULT NULL,
  `is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwiktionary_actor_groups` (
  `actor_id` bigint(20) NOT NULL,
  `group_name` varbinary(255) NOT NULL,
  PRIMARY KEY (`actor_id`,`group_name`),
  CONSTRAINT `huwiktionary_actor_groups_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwiktionary_actor_stats` (
  `actor_id` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`date`),
  CONSTRAINT `huwiktionary_actor_stats_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `huwiktionary_actor_stats_by_ns` (
  `actor_id` bigint(20) NOT NULL,
  `namespace` int(11) NOT NULL,
  `date` date NOT NULL,
  `daily_edits` int(11) NOT NULL,
  `edits_to_date` int(11) NOT NULL,
  PRIMARY KEY (`actor_id`,`namespace`,`date`),
  CONSTRAINT `huwiktionary_actor_stats_by_ns_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
