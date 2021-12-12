import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { bufferToDateTransformer, bufferToStringTransformer } from "../../transformers";
import { UserGroup } from "./userGroup";

@Entity()
export class User {
	// user_id int(5) UN
	@PrimaryGeneratedColumn({ name: "user_id", type: "int", unsigned: true })
	public id: number;

	// user_name varbinary(255)
	@Column({ name: "user_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
	public name: string;

	// user_real_name varbinary(255)
	@Column({ name: "user_real_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
	public realName: string;

	// user_registration varbinary(14)
	@Column({ name: "user_registration", type: "varbinary", length: 14, transformer: bufferToDateTransformer })
	public registrationTimestamp: Date;

	// user_editcount int(11)
	@Column({ name: "user_editcount", type: "int" })
	public editCount: number;

	@OneToMany(() => UserGroup, userGroup => userGroup.user)
	public userGroups: UserGroup[];
}
