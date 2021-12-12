import { Column, Entity, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { bufferToDateTransformer, bufferToStringTransformer, intToBooleanTransformer } from "../../transformers";
import { Actor } from "./actor";
import { ChangeTag } from "./changeTag";
import { Comment } from "./comment";
import { Page } from "./page";

@Entity()
export class Revision {
	// rev_id int(8) UN
	@PrimaryGeneratedColumn({ name: "rev_id", type: "int", unsigned: true })
	public id: number;

	// rev_page int(8) UN
	@Column({ name: "rev_page", type: "int", unsigned: true })
	public pageId: number;

	// rev_page int(8) UN
	@OneToOne(() => Page, page => page.id)
	@JoinColumn({ name: "rev_page" })
	public page: Page;

	// rev_comment_id decimal(20,0)
	@Column({ name: "rev_comment_id", type: "decimal", precision: 20, scale: 0 })
	public commentId: number;

	@OneToOne(() => Comment, comment => comment.id)
	@JoinColumn({ name: "rev_comment_id" })
	public comment: Comment;

	// rev_actor decimal(20,0)
	@Column({ name: "rev_actor", type: "decimal", precision: 20, scale: 0 })
	public actorId: number;

	// rev_actor decimal(20,0)
	@OneToOne(() => Actor, actor => actor.id)
	@JoinColumn({ name: "rev_actor" })
	public actor: Actor;

	// rev_timestamp varbinary(14)
	@Column({ name: "rev_timestamp", type: "varbinary", length: 14, transformer: bufferToDateTransformer })
	public timestamp: Date;

	// rev_minor_edit tinyint(1) UN
	@Column({ name: "rev_minor_edit", type: "tinyint", unsigned: true, transformer: intToBooleanTransformer })
	public isMinorEdit: boolean;

	// rev_deleted tinyint(1) UN
	@Column({ name: "rev_deleted", type: "tinyint", unsigned: true, transformer: intToBooleanTransformer })
	public isDeleted: boolean;

	// rev_len int(8) UN
	@Column({ name: "rev_len", type: "int", unsigned: true })
	public length: number;

	// rev_parent_id int(8) UN
	@Column({ name: "rev_parent_id", type: "int", unsigned: true })
	public parentRevisionId: number;

	// rev_parent_id int(8) UN
	@OneToOne(() => Revision, revision => revision.id)
	@JoinColumn({ name: "rev_parent_id" })
	public parentRevision: Revision;

	// rev_sha1 varbinary(32)
	@Column({ name: "rev_sha1", type: "varbinary", length: 32, transformer: bufferToStringTransformer })
	public sha1: string;

	@OneToMany(() => ChangeTag, changeTag => changeTag.revision)
	public changeTags: ChangeTag[];
}
