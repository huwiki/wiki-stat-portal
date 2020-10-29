import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class WikiProcessedRevisions {
	// wiki varchar(30) PK 
	@PrimaryColumn({ type: "varchar", length: 30 })
	public wiki: string;

	// last_processed_revision_id int(8)
	@Column({ name: "last_processed_revision_id", type: "int", unsigned: true })
	public lastProcessedRevisionId: number;
}
