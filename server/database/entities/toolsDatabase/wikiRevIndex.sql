CREATE DATABASE `USERID__userstatistics2`
/*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */
;
CREATE TABLE `wiki_processed_revisions_v2` (
	`wiki` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
	`last_processed_revision_id` int(10) NOT NULL,
	`last_processed_revision_timestamp` datetime DEFAULT NULL,
	`last_processed_log_id` int(10) NOT NULL,
	`last_processed_log_timestamp` datetime DEFAULT NULL,
	`last_actor_update` datetime NOT NULL,
	PRIMARY KEY (`wiki`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
