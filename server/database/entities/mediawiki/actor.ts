import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { bufferToStringTransformer } from "../../transformers";
import { User } from "./user";

@Entity()
export class Actor {
	// actor_id bigint(20) UN
	@PrimaryGeneratedColumn({ name: "actor_id", type: "bigint", unsigned: true })
	public id: number;

	// actor_user int(10) UN
	@Column({ name: "actor_user", type: "int", unsigned: true })
	public userId: number;

	// actor_user int(10) UN
	@OneToOne(() => User, user => user.id)
	@JoinColumn({ name: "actor_user" })
	public user: User;

	// actor_name varbinary(255)
	@Column({ name: "actor_name", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
	public name: string;
}
