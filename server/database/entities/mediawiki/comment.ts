import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { bufferToStringTransformer } from "../../transformers";

@Entity()
export class Comment {

	// comment_id bigint(20) UN 
	@PrimaryGeneratedColumn({ name: "comment_id", type: "bigint", unsigned: true })
	public id: number;

	// comment_hash int(11)
	@Column({ name: "comment_hash", type: "int" })
	public hash: number;

	// comment_text blob 
	@Column({ name: "comment_text", type: "blob", transformer: bufferToStringTransformer })
	public text: string;

	// comment_data blob
	@Column({ name: "comment_data", type: "blob", transformer: bufferToStringTransformer })
	public data: string;
}
