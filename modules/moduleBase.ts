import { IconName } from "@blueprintjs/core";
import { IModuleParameter } from "./parameters/moduleParameter";

export abstract class ModuleBase {
	abstract get identifier(): string;
	abstract get icon(): IconName;
	abstract get availableAt(): string[];
	abstract getParameters(): IModuleParameter[];
}
