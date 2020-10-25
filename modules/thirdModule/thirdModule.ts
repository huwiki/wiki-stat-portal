import { IconName } from "@blueprintjs/core";
import { ModuleBase } from "../common/moduleBase";
import { IModuleParameter } from "../common/parameters/moduleParameter";

export class ThirdModule extends ModuleBase {
	get identifier(): string {
		return "third";
	}

	get icon(): IconName {
		return "outdated";
	}

	get availableAt(): string[] {
		return [];
	}

	getParameters(): IModuleParameter[] {
		return [];
	}
}
