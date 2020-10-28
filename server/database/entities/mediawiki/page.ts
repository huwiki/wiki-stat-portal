import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { bufferToDateTimeTransformer, bufferToStringTransformer, intToBooleanTransformer } from "../../transformers";
import { Revision } from "./revision";

@Entity()
export class Page {
	// page_id int(8) UN 
	@PrimaryGeneratedColumn({ name: "page_id", type: "int", unsigned: true })
	public id: number;

	// page_namespace int(11) 
	@Column({ name: "page_namespace", type: "int", unsigned: true })
	public namespace: number;

	// page_title varbinary(255) 
	@Column({ name: "page_title", type: "varbinary", length: 255, transformer: bufferToStringTransformer })
	public title: string;

	// page_restrictions varbinary(255) 
	@Column({ name: "page_restrictions", type: "varbinary", length: 255, scale: 0, transformer: bufferToStringTransformer })
	public restrictions: string;

	// page_is_redirect tinyint(1) UN 
	@Column({ name: "page_is_redirect", type: "tinyint", unsigned: true, transformer: intToBooleanTransformer })
	public isRedirect: boolean;

	// page_is_new tinyint(1) UN 
	@Column({ name: "page_is_new", type: "tinyint", unsigned: true, transformer: intToBooleanTransformer })
	public isNew: boolean;

	// page_random double UN 
	@Column({ name: "page_random", type: "double", unsigned: true })
	public random: number;

	// page_touched varbinary(14) 
	@Column({ name: "page_touched", type: "varbinary", length: 14, scale: 0, transformer: bufferToDateTimeTransformer })
	public lastTouchTimestamp: Date;

	// page_links_updated varbinary(14) 
	@Column({ name: "page_links_updated", type: "varbinary", length: 14, scale: 0, transformer: bufferToDateTimeTransformer })
	public linksUpdateTimestamp: Date;

	// page_latest int(8) UN 
	@Column({ name: "page_latest", type: "int", unsigned: true })
	public latestRevisionId: number;

	// page_latest int(8) UN 
	@OneToOne(() => Revision, revision => revision.id)
	@JoinColumn({ name: "page_latest" })
	public latestRevision: Revision;

	// page_len int(8) UN 
	@Column({ name: "page_len", type: "int", unsigned: true })
	public length: number;

	// page_content_model varbinary(32) 
	@Column({ name: "page_content_model", type: "varbinary", length: 32, scale: 0, transformer: bufferToStringTransformer })
	public contentModel: string;

	// page_lang varbinary(35)
	@Column({ name: "page_lang", type: "varbinary", length: 35, scale: 0, transformer: bufferToStringTransformer })
	public language: string;
}
