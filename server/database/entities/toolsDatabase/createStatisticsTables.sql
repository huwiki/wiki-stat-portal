CREATE TABLE `wiki_processed_revisions_v2` (
	`wiki` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
	`last_processed_revision_id` int(10) NOT NULL,
	`last_processed_log_id` int(10) NOT NULL,
	`last_actor_update` datetime NOT NULL,
	PRIMARY KEY (`wiki`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- huwiki
CREATE TABLE `huwiki_actor_v2` (
	`actor_id` bigint(20) NOT NULL,
	`actor_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	`is_registered` tinyint(1) NOT NULL,
	`registration_timestamp` datetime DEFAULT NULL,
	`is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
	`first_edit_timestamp` datetime,
	`last_edit_timestamp` datetime,
	`first_log_entry_timestamp` datetime,
	`last_log_entry_timestamp` datetime,
	PRIMARY KEY (`actor_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_actor_groups_v2` (
	`actor_id` bigint(20) NOT NULL,
	`group_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	PRIMARY KEY (`actor_id`, `group_name`),
	CONSTRAINT `huwiki_actor_groups_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor_v2` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_daily_stats_v2` (
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_actor_daily_stats_v2` (
	`actor_id` bigint(20) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	`daily_saward_log_events` int(11) NOT NULL,
	`saward_log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `date`),
	CONSTRAINT `huwiki_actor_daily_stats_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwiki_actor_daily_stats_v2_date` (`date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_daily_stats_by_ns_v2` (
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_actor_daily_stats_by_ns_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `date`),
	CONSTRAINT `huwiki_actor_daily_stats_by_ns_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwiki_actor_daily_stats_by_ns_v2_date` (`actor_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_edit_stats_by_nsct_v2` (
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `change_tag_id`, `date`),
	INDEX `huwiki_edit_stats_by_nsct_v2_by_ct` (`change_tag_id`),
	INDEX `huwiki_edit_stats_by_nsct_v2_by_ct_date` (`change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_actor_edit_stats_by_nsct_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `change_tag_id`, `date`),
	CONSTRAINT `huwiki_actor_edit_stats_by_nsct_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwiki_actor_edit_stats_by_nsct_v2_by_ct` (`actor_id`, `change_tag_id`),
	INDEX `huwiki_actor_edit_stats_by_nsct_v2_by_ct_date` (`actor_id`, `change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_log_stats_by_nslt_v2` (
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `log_type`, `log_action`, `date`),
	INDEX `huwiki_log_stats_by_nslt_v2_by_ns` (`namespace`, `date`),
	INDEX `huwiki_log_stats_by_nslt_v2_by_log_type` (`log_type`, `date`),
	INDEX `huwiki_log_stats_by_nslt_v2_by_log_action` (`log_action`, `date`),
	INDEX `huwiki_log_stats_by_nslt_v2_by_ns_log_type` (`namespace`, `log_type`, `date`),
	INDEX `huwiki_log_stats_by_nslt_v2_by_ns_log_actor` (`namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiki_actor_log_stats_by_nslt_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`namespace`,
		`log_type`,
		`log_action`,
		`date`
	),
	CONSTRAINT `huwiki_actor_log_stats_by_nslt_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiki_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwiki_actor_log_stats_by_nslt_v2_by_ns` (`actor_id`, `namespace`, `date`),
	INDEX `huwiki_actor_log_stats_by_nslt_v2_by_log_type` (`actor_id`, `log_type`, `date`),
	INDEX `huwiki_actor_log_stats_by_nslt_v2_by_log_action` (`actor_id`, `log_action`, `date`),
	INDEX `huwiki_actor_log_stats_by_nslt_v2_by_ns_log_type` (`actor_id`, `namespace`, `log_type`, `date`),
	INDEX `huwiki_actor_log_stats_by_nslt_v2_by_ns_log_actor` (`actor_id`, `namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- huwikisource
CREATE TABLE `huwikisource_actor_v2` (
	`actor_id` bigint(20) NOT NULL,
	`actor_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	`is_registered` tinyint(1) NOT NULL,
	`registration_timestamp` datetime DEFAULT NULL,
	`is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
	`first_edit_timestamp` datetime,
	`last_edit_timestamp` datetime,
	`first_log_entry_timestamp` datetime,
	`last_log_entry_timestamp` datetime,
	PRIMARY KEY (`actor_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_actor_groups_v2` (
	`actor_id` bigint(20) NOT NULL,
	`group_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	PRIMARY KEY (`actor_id`, `group_name`),
	CONSTRAINT `huwikisource_actor_groups_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor_v2` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_daily_stats_v2` (
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_actor_daily_stats_v2` (
	`actor_id` bigint(20) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	`daily_saward_log_events` int(11) NOT NULL,
	`saward_log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `date`),
	CONSTRAINT `huwikisource_actor_daily_stats_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_daily_stats_by_ns_v2` (
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_actor_daily_stats_by_ns_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `date`),
	CONSTRAINT `huwikisource_actor_daily_stats_by_ns_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_edit_stats_by_nsct_v2` (
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `change_tag_id`, `date`),
	INDEX `huwikisource_edit_stats_by_nsct_v2_by_ct` (`change_tag_id`),
	INDEX `huwikisource_edit_stats_by_nsct_v2_by_ct_date` (`change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_actor_edit_stats_by_nsct_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `change_tag_id`, `date`),
	CONSTRAINT `huwikisource_actor_edit_stats_by_nsct_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwikisource_actor_edit_stats_by_nsct_v2_by_ct` (`actor_id`, `change_tag_id`),
	INDEX `huwikisource_actor_edit_stats_by_nsct_v2_by_ct_date` (`actor_id`, `change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_log_stats_by_nslt_v2` (
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `log_type`, `log_action`, `date`),
	INDEX `huwikisource_log_stats_by_nslt_v2_by_ns` (`namespace`, `date`),
	INDEX `huwikisource_log_stats_by_nslt_v2_by_log_type` (`log_type`, `date`),
	INDEX `huwikisource_log_stats_by_nslt_v2_by_log_action` (`log_action`, `date`),
	INDEX `huwikisource_log_stats_by_nslt_v2_by_ns_log_type` (`namespace`, `log_type`, `date`),
	INDEX `huwikisource_log_stats_by_nslt_v2_by_ns_log_actor` (`namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikisource_actor_log_stats_by_nslt_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`namespace`,
		`log_type`,
		`log_action`,
		`date`
	),
	CONSTRAINT `huwikisource_actor_log_stats_by_nslt_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikisource_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwikisource_actor_log_stats_by_nslt_v2_by_ns` (`actor_id`, `namespace`, `date`),
	INDEX `huwikisource_actor_log_stats_by_nslt_v2_by_log_type` (`actor_id`, `log_type`, `date`),
	INDEX `huwikisource_actor_log_stats_by_nslt_v2_by_log_action` (`actor_id`, `log_action`, `date`),
	INDEX `huwikisource_actor_log_stats_by_nslt_v2_by_ns_log_type` (`actor_id`, `namespace`, `log_type`, `date`),
	INDEX `huwikisource_actor_log_stats_by_nslt_v2_by_ns_log_actor` (`actor_id`, `namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- huwikiquote
CREATE TABLE `huwikiquote_actor_v2` (
	`actor_id` bigint(20) NOT NULL,
	`actor_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	`is_registered` tinyint(1) NOT NULL,
	`registration_timestamp` datetime DEFAULT NULL,
	`is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
	`first_edit_timestamp` datetime,
	`last_edit_timestamp` datetime,
	`first_log_entry_timestamp` datetime,
	`last_log_entry_timestamp` datetime,
	PRIMARY KEY (`actor_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_actor_groups_v2` (
	`actor_id` bigint(20) NOT NULL,
	`group_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	PRIMARY KEY (`actor_id`, `group_name`),
	CONSTRAINT `huwikiquote_actor_groups_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_daily_stats_v2` (
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_actor_daily_stats_v2` (
	`actor_id` bigint(20) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	`daily_saward_log_events` int(11) NOT NULL,
	`saward_log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `date`),
	CONSTRAINT `huwikiquote_actor_daily_stats_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_daily_stats_by_ns_v2` (
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_actor_daily_stats_by_ns_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `date`),
	CONSTRAINT `huwikiquote_actor_daily_stats_by_ns_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_edit_stats_by_nsct_v2` (
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `change_tag_id`, `date`),
	INDEX `huwikiquote_edit_stats_by_nsct_v2_by_ct` (`change_tag_id`),
	INDEX `huwikiquote_edit_stats_by_nsct_v2_by_ct_date` (`change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_actor_edit_stats_by_nsct_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `change_tag_id`, `date`),
	CONSTRAINT `huwikiquote_actor_edit_stats_by_nsct_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwikiquote_actor_edit_stats_by_nsct_v2_by_ct` (`actor_id`, `change_tag_id`),
	INDEX `huwikiquote_actor_edit_stats_by_nsct_v2_by_ct_date` (`actor_id`, `change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_log_stats_by_nslt_v2` (
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `log_type`, `log_action`, `date`),
	INDEX `huwikiquote_log_stats_by_nslt_v2_by_ns` (`namespace`, `date`),
	INDEX `huwikiquote_log_stats_by_nslt_v2_by_log_type` (`log_type`, `date`),
	INDEX `huwikiquote_log_stats_by_nslt_v2_by_log_action` (`log_action`, `date`),
	INDEX `huwikiquote_log_stats_by_nslt_v2_by_ns_log_type` (`namespace`, `log_type`, `date`),
	INDEX `huwikiquote_log_stats_by_nslt_v2_by_ns_log_actor` (`namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwikiquote_actor_log_stats_by_nslt_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`namespace`,
		`log_type`,
		`log_action`,
		`date`
	),
	CONSTRAINT `huwikiquote_actor_log_stats_by_nslt_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwikiquote_actor_log_stats_by_nslt_v2_by_ns` (`actor_id`, `namespace`, `date`),
	INDEX `huwikiquote_actor_log_stats_by_nslt_v2_by_log_type` (`actor_id`, `log_type`, `date`),
	INDEX `huwikiquote_actor_log_stats_by_nslt_v2_by_log_action` (`actor_id`, `log_action`, `date`),
	INDEX `huwikiquote_actor_log_stats_by_nslt_v2_by_ns_log_type` (`actor_id`, `namespace`, `log_type`, `date`),
	INDEX `huwikiquote_actor_log_stats_by_nslt_v2_by_ns_log_actor` (`actor_id`, `namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
-- huwiktionary
CREATE TABLE `huwiktionary_actor_v2` (
	`actor_id` bigint(20) NOT NULL,
	`actor_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	`is_registered` tinyint(1) NOT NULL,
	`registration_timestamp` datetime DEFAULT NULL,
	`is_registration_timestamp_from_first_edit` tinyint(1) DEFAULT NULL,
	`first_edit_timestamp` datetime,
	`last_edit_timestamp` datetime,
	`first_log_entry_timestamp` datetime,
	`last_log_entry_timestamp` datetime,
	PRIMARY KEY (`actor_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_actor_groups_v2` (
	`actor_id` bigint(20) NOT NULL,
	`group_name` varchar(255) CHARACTER SET utf8 NOT NULL,
	PRIMARY KEY (`actor_id`, `group_name`),
	CONSTRAINT `huwiktionary_actor_groups_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor_v2` (`actor_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_daily_stats_v2` (
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_actor_daily_stats_v2` (
	`actor_id` bigint(20) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_received_thanks` int(11) NOT NULL,
	`received_thanks_to_date` int(11) NOT NULL,
	`daily_sent_thanks` int(11) NOT NULL,
	`sent_thanks_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	`daily_saward_log_events` int(11) NOT NULL,
	`saward_log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `date`),
	CONSTRAINT `huwiktionary_actor_daily_stats_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_daily_stats_by_ns_v2` (
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_actor_daily_stats_by_ns_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_reverted_edits` int(11) NOT NULL,
	`reverted_edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `date`),
	CONSTRAINT `huwiktionary_actor_daily_stats_by_ns_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_edit_stats_by_nsct_v2` (
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `change_tag_id`, `date`),
	INDEX `huwiktionary_edit_stats_by_nsct_v2_by_ct` (`change_tag_id`),
	INDEX `huwiktionary_edit_stats_by_nsct_v2_by_ct_date` (`change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_actor_edit_stats_by_nsct_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `change_tag_id`, `date`),
	CONSTRAINT `huwiktionary_actor_edit_stats_by_nsct_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwiktionary_actor_edit_stats_by_nsct_v2_by_ct` (`actor_id`, `change_tag_id`),
	INDEX `huwiktionary_actor_edit_stats_by_nsct_v2_by_ct_date` (`actor_id`, `change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_log_stats_by_nslt_v2` (
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `log_type`, `log_action`, `date`),
	INDEX `huwiktionary_log_stats_by_nslt_v2_by_ns` (`namespace`, `date`),
	INDEX `huwiktionary_log_stats_by_nslt_v2_by_log_type` (`log_type`, `date`),
	INDEX `huwiktionary_log_stats_by_nslt_v2_by_log_action` (`log_action`, `date`),
	INDEX `huwiktionary_log_stats_by_nslt_v2_by_ns_log_type` (`namespace`, `log_type`, `date`),
	INDEX `huwiktionary_log_stats_by_nslt_v2_by_ns_log_actor` (`namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
CREATE TABLE `huwiktionary_actor_log_stats_by_nslt_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`namespace`,
		`log_type`,
		`log_action`,
		`date`
	),
	CONSTRAINT `huwiktionary_actor_log_stats_by_nslt_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwiktionary_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwiktionary_actor_log_stats_by_nslt_v2_by_ns` (`actor_id`, `namespace`, `date`),
	INDEX `huwiktionary_actor_log_stats_by_nslt_v2_by_log_type` (`actor_id`, `log_type`, `date`),
	INDEX `huwiktionary_actor_log_stats_by_nslt_v2_by_log_action` (`actor_id`, `log_action`, `date`),
	INDEX `huwiktionary_actor_log_stats_by_nslt_v2_by_ns_log_type` (`actor_id`, `namespace`, `log_type`, `date`),
	INDEX `huwiktionary_actor_log_stats_by_nslt_v2_by_ns_log_actor` (`actor_id`, `namespace`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
