-- -----------------------------------------------------------------------------------------------------
-- huwikiquote -----------------------------------------------------------------------------------------
-- -----------------------------------------------------------------------------------------------------


-- Actor table
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


-- Statistics by date
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
	CONSTRAINT `huwikiquote_actor_daily_stats_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwikiquote_actor_daily_stats_v2_date` (`date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- Statistics by namespace
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
	CONSTRAINT `huwikiquote_actor_daily_stats_by_ns_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE,
	INDEX `huwikiquote_actor_daily_stats_by_ns_v2_date` (`actor_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- Statistics by change tag
CREATE TABLE `huwikiquote_edit_stats_by_tag_v2` (
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_edit_stats_by_tag_v2` (
	`actor_id` bigint(20) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `change_tag_id`, `date`),
	CONSTRAINT `huwikiquote_actor_edit_stats_by_nsct_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- Statistics by namespace and change tag
CREATE TABLE `huwikiquote_edit_stats_by_ns_tag_v2` (
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`namespace`, `change_tag_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_edit_stats_by_ns_tag_v2` (
	`actor_id` bigint(20) NOT NULL,
	`namespace` int(11) NOT NULL,
	`change_tag_id` int(10) NOT NULL,
	`date` date NOT NULL,
	`daily_edits` int(11) NOT NULL,
	`edits_to_date` int(11) NOT NULL,
	`daily_character_changes` int(11) NOT NULL,
	`character_changes_to_date` int(11) NOT NULL,
	PRIMARY KEY (`actor_id`, `namespace`, `change_tag_id`, `date`),
	CONSTRAINT `huwikiquote_actor_edit_stats_by_ns_tag_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- Statistics by log type
CREATE TABLE `huwikiquote_log_stats_by_type_v2` (
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`log_type`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_log_stats_by_type_v2` (
	`actor_id` bigint(20) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`log_type`,
		`date`
	),
	CONSTRAINT `huwikiquote_actor_log_stats_by_type_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- Statistics by log action
CREATE TABLE `huwikiquote_log_stats_by_action_v2` (
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_log_stats_by_action_v2` (
	`actor_id` bigint(20) NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`log_action`,
		`date`
	),
	CONSTRAINT `huwikiquote_actor_log_stats_by_action_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;


-- Statistics by log type and action
CREATE TABLE `huwikiquote_log_stats_by_type_action_v2` (
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (`log_type`, `log_action`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE `huwikiquote_actor_log_stats_by_type_action_v2` (
	`actor_id` bigint(20) NOT NULL,
	`log_type` varchar(32) CHARACTER SET utf8 NOT NULL,
	`log_action` varchar(32) CHARACTER SET utf8 NOT NULL,
	`date` date NOT NULL,
	`daily_log_events` int(11) NOT NULL,
	`log_events_to_date` int(11) NOT NULL,
	PRIMARY KEY (
		`actor_id`,
		`log_type`,
		`log_action`,
		`date`
	),
	CONSTRAINT `huwikiquote_actor_log_stats_by_type_action_v2_actor` FOREIGN KEY (`actor_id`) REFERENCES `huwikiquote_actor_v2` (`actor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
