SELECT act.actor_id, act.actor_name , SUM(stats.daily_edits) as edits
FROM USERNAME__userstatistics.huwiki_actor AS act
LEFT JOIN USERNAME__userstatistics.huwiki_actor_stats AS stats ON (act.actor_id = stats.actor_id)
GROUP BY act.actor_id;
