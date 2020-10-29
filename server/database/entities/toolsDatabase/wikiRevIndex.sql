CREATE DATABASE `USERID__userstatistics` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

CREATE TABLE `USERID__wiki_processed_revisions` (
  `wiki` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_processed_revision_id` int(8) NOT NULL,
  PRIMARY KEY (`wiki`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
