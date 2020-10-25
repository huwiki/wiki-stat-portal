import { IconName } from "@blueprintjs/core";

export interface ModuleDescriptor {
	id: string;
	icon: IconName;
	availableAt: string[];
}
