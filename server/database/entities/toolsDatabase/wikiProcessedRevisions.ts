import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("wiki_processed_revisions_v2")
export class WikiProcessedRevisions {
	@PrimaryColumn({ type: "varchar", length: 30 })
	public wiki: string;

	@Column({ name: "last_processed_revision_id", type: "int", unsigned: true })
	public lastProcessedRevisionId: number;

	@Column({ name: "last_processed_revision_timestamp", type: "datetime" })
	public lastProcessedRevisionTimestamp: Date | null;

	@Column({ name: "last_processed_log_id", type: "int", unsigned: true })
	public lastProcessedLogId: number;

	@Column({ name: "last_processed_log_timestamp", type: "datetime" })
	public lastProcessedLogTimestamp: Date | null;

	@Column({ name: "last_run", type: "datetime" })
	public lastRun: Date;
}
