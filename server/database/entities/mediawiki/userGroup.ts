import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { bufferToDateTimeTransformer, bufferToStringTransformer } from "../../transformers";
import { User } from "./user";

@Entity({ name: "user_groups" })
export class UserGroup {
	// ug_user int(5) UN 
	@PrimaryColumn({ name: "ug_user", type: "int", unsigned: true })
	public userId: number;

	// actor_user int(10) UN
	@ManyToOne(() => User, user => user.userGroups)
	@JoinColumn({ name: "ug_user" })
	public user: User;

	// ug_group varbinary(255)  
	@PrimaryColumn({ name: "ug_group", type: "varbinary", transformer: bufferToStringTransformer })
	public groupName: string;

	// ug_expiry varbinary(14) 
	@Column({ name: "ug_expiry", type: "varbinary", length: 14, transformer: bufferToDateTimeTransformer })
	public expirationTimestamp: Date;
}
