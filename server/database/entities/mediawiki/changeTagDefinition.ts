import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { bufferToStringTransformer } from "../../transformers";

@Entity({ name: "change_tag_def" })
export class ChangeTagDefinition {
	// ctd_id int(10) UN
	@PrimaryGeneratedColumn({ name: "ctd_id", type: "int", unsigned: true })
	public id: number;

	// ctd_name varbinary(255)
	@Column({ name: "ctd_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
	public name: string;
}
