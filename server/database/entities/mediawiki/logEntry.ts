import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { bufferToDateTransformer, bufferToStringTransformer, intToBooleanTransformer } from "../../transformers";
import { Actor } from "./actor";

@Entity({ name: "logging" })
export class LogEntry {
	// rev_id int(10) UN
	@PrimaryGeneratedColumn({ name: "log_id", type: "int", unsigned: true })
	public id: number;

	// log_type varbinary(32)
	@Column({ name: "log_type", type: "varbinary", length: 32, transformer: bufferToStringTransformer })
	public type: string;

	// log_action varbinary(32)
	@Column({ name: "log_action", type: "varbinary", length: 32, transformer: bufferToStringTransformer })
	public action: string;

	// log_timestamp varbinary(14)
	@Column({ name: "log_timestamp", type: "varbinary", length: 14, scale: 0, transformer: bufferToDateTransformer })
	public timestamp: Date;

	// log_actor decimal(20,0)
	@Column({ name: "log_actor", type: "decimal", precision: 20, scale: 0 })
	public actorId: number;

	// log_actor decimal(20,0)
	@OneToOne(() => Actor, actor => actor.id)
	@JoinColumn({ name: "log_actor" })
	public actor: Actor;

	// log_namespace int(11)
	@Column({ name: "log_namespace", type: "int", unsigned: true })
	public namespace: number;

	// log_title varbinary(255)
	@Column({ name: "log_title", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
	public title: string;

	// log_deleted tinyint(1) UN
	@Column({ name: "log_deleted", type: "tinyint", unsigned: true, transformer: intToBooleanTransformer })
	public isDeleted: boolean;
}
