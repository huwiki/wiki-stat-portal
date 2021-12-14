import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { bufferToStringTransformer } from "../../transformers";
import { Revision } from "./revision";

@Entity()
export class ChangeTag {
	// ct_id int(10) UN
	@PrimaryGeneratedColumn({ name: "ct_id", type: "bigint", unsigned: true })
	public id: number;

	// ct_rev_id int(10) UN
	@Column({ name: "ct_rev_id", type: "int", unsigned: true })
	public revisionId: number;

	// rev_parent_id int(8) UN
	@ManyToOne(() => Revision, revision => revision.id)
	@JoinColumn({ name: "ct_rev_id" })
	public revision: Revision;

	// ct_params BLOB
	@Column({ name: "ct_params", type: "blob", transformer: bufferToStringTransformer })
	public params: string;

	// ct_tag_id int(10) UN
	@Column({ name: "ct_tag_id", type: "int", unsigned: true })
	public tagDefitionId: number;
}
